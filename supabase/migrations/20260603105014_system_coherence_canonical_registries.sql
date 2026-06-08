/*
  # System Coherence: Single Sources of Truth + Canonical Registries (v2)

  Same goals as the previous attempt but uses the correct jsonb column
  `runtime_jobs.approval_state_obj` (the text `approval_state` is legacy).

  1. New canonical tables: runtime_route_state, runtime_scoring_state,
     runtime_approval_state, runtime_connector_registry, runtime_coherence_violations
  2. Canonical view: runtime_health_state (unifies runtime_agent_health + subsystem_health)
  3. Single write paths: record_approval, record_score, register_connector
  4. Detector: detect_coherence_violations
  5. Seeds: routes for all known agents, free-first connectors, approval bootstrap
  6. Security: RLS service_role only on every new table; SECURITY DEFINER functions
     with locked search_path; EXECUTE granted to service_role only
*/

CREATE TABLE IF NOT EXISTS runtime_route_state (
  route_key text PRIMARY KEY,
  route_kind text NOT NULL DEFAULT 'agent',
  status text NOT NULL DEFAULT 'healthy',
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  last_error text NOT NULL DEFAULT '',
  consecutive_failures int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_route_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages route state" ON runtime_route_state FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_scoring_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'orchestrator',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_kind, subject_id, source)
);
ALTER TABLE runtime_scoring_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages scoring state" ON runtime_scoring_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_runtime_scoring_subject ON runtime_scoring_state (subject_kind, subject_id);

CREATE TABLE IF NOT EXISTS runtime_approval_state (
  task_id text PRIMARY KEY,
  state text NOT NULL DEFAULT 'pending',
  approved_by text NOT NULL DEFAULT '',
  approved_at timestamptz,
  blocked_by text NOT NULL DEFAULT '',
  blocked_at timestamptz,
  block_reason text NOT NULL DEFAULT '',
  policy_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_approval_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages approval state" ON runtime_approval_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_runtime_approval_state ON runtime_approval_state (state);

CREATE TABLE IF NOT EXISTS runtime_connector_registry (
  connector_key text PRIMARY KEY,
  connector_kind text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  auth_method text NOT NULL DEFAULT 'none',
  timeout_ms int NOT NULL DEFAULT 30000,
  evidence_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_roles text[] NOT NULL DEFAULT ARRAY['service_role']::text[],
  free_first boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'approved',
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE runtime_connector_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages connector registry" ON runtime_connector_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_coherence_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_kind text NOT NULL,
  subject text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE runtime_coherence_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages coherence violations" ON runtime_coherence_violations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_coherence_status ON runtime_coherence_violations (status, detected_at DESC);

CREATE OR REPLACE VIEW runtime_health_state AS
SELECT 'agent'::text AS subject_kind, role AS subject_id, last_probe_ok AS ok, severity, last_probe_at AS last_seen, last_error AS error, consecutive_failures
FROM runtime_agent_health
UNION ALL
SELECT 'subsystem'::text,
       name,
       (status = 'ok'),
       CASE WHEN status = 'ok' THEN 'low' WHEN status = 'degraded' THEN 'medium' ELSE 'high' END,
       COALESCE(last_failure_at, last_success_at, now()),
       COALESCE(failure_reason, ''),
       COALESCE(consecutive_failures, 0)
FROM subsystem_health;

GRANT SELECT ON runtime_health_state TO service_role;

CREATE OR REPLACE FUNCTION detect_coherence_violations()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inserted int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_queue') THEN
    INSERT INTO runtime_coherence_violations (violation_kind, subject, details)
    SELECT 'duplicate_queue', 'job_queue', jsonb_build_object('legacy_count', count(*))
    FROM public.job_queue
    WHERE NOT EXISTS (SELECT 1 FROM runtime_coherence_violations WHERE violation_kind = 'duplicate_queue' AND status = 'open')
    HAVING count(*) > 0;
    GET DIAGNOSTICS inserted = ROW_COUNT;
  END IF;

  INSERT INTO runtime_coherence_violations (violation_kind, subject, details)
  SELECT 'approval_drift', j.task_id, jsonb_build_object('jobs_state', j.approval_state_obj->>'state', 'canonical_state', a.state)
  FROM runtime_jobs j
  JOIN runtime_approval_state a ON a.task_id = j.task_id
  WHERE COALESCE(j.approval_state_obj->>'state', 'pending') <> a.state
    AND NOT EXISTS (SELECT 1 FROM runtime_coherence_violations v WHERE v.violation_kind = 'approval_drift' AND v.subject = j.task_id AND v.status = 'open');

  RETURN inserted;
END $$;
REVOKE EXECUTE ON FUNCTION detect_coherence_violations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION detect_coherence_violations() TO service_role;

CREATE OR REPLACE FUNCTION record_approval(p_task_id text, p_state text, p_actor text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_state NOT IN ('pending', 'approved', 'blocked', 'revoked') THEN
    RAISE EXCEPTION 'invalid_approval_state: %', p_state;
  END IF;

  INSERT INTO runtime_approval_state (task_id, state, approved_by, approved_at, blocked_by, blocked_at, block_reason, updated_at)
  VALUES (p_task_id, p_state,
    CASE WHEN p_state = 'approved' THEN p_actor ELSE '' END,
    CASE WHEN p_state = 'approved' THEN now() ELSE NULL END,
    CASE WHEN p_state IN ('blocked','revoked') THEN p_actor ELSE '' END,
    CASE WHEN p_state IN ('blocked','revoked') THEN now() ELSE NULL END,
    CASE WHEN p_state IN ('blocked','revoked') THEN p_reason ELSE '' END,
    now())
  ON CONFLICT (task_id) DO UPDATE
    SET state = EXCLUDED.state,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        blocked_by = EXCLUDED.blocked_by,
        blocked_at = EXCLUDED.blocked_at,
        block_reason = EXCLUDED.block_reason,
        updated_at = now();

  UPDATE runtime_jobs
  SET approval_state_obj = jsonb_build_object('state', p_state, 'actor', p_actor, 'reason', p_reason, 'at', now()),
      approval_state = p_state,
      updated_at = now()
  WHERE task_id = p_task_id;

  INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
  VALUES (p_task_id, 'orchestrator', 'approval:' || p_state, jsonb_build_object('actor', p_actor, 'reason', p_reason));
END $$;
REVOKE EXECUTE ON FUNCTION record_approval(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_approval(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION record_score(p_subject_kind text, p_subject_id text, p_score numeric, p_reason text, p_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO runtime_scoring_state (subject_kind, subject_id, score, reason, source, recorded_at)
  VALUES (p_subject_kind, p_subject_id, p_score, p_reason, p_source, now())
  ON CONFLICT (subject_kind, subject_id, source) DO UPDATE
    SET score = EXCLUDED.score, reason = EXCLUDED.reason, recorded_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION record_score(text, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_score(text, text, numeric, text, text) TO service_role;

CREATE OR REPLACE FUNCTION register_connector(p_key text, p_kind text, p_scope jsonb, p_auth_method text, p_timeout_ms int, p_free_first boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_auth_method NOT IN ('none','bearer','api_key','oauth','mtls','service_role') THEN
    RAISE EXCEPTION 'invalid_auth_method: %', p_auth_method;
  END IF;
  INSERT INTO runtime_connector_registry (connector_key, connector_kind, scope, auth_method, timeout_ms, free_first, status)
  VALUES (p_key, p_kind, p_scope, p_auth_method, p_timeout_ms, p_free_first, 'approved')
  ON CONFLICT (connector_key) DO UPDATE
    SET connector_kind = EXCLUDED.connector_kind, scope = EXCLUDED.scope,
        auth_method = EXCLUDED.auth_method, timeout_ms = EXCLUDED.timeout_ms,
        free_first = EXCLUDED.free_first;
END $$;
REVOKE EXECUTE ON FUNCTION register_connector(text, text, jsonb, text, int, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_connector(text, text, jsonb, text, int, boolean) TO service_role;

INSERT INTO runtime_route_state (route_key, route_kind, status, metadata)
SELECT 'agent:' || role, 'agent', 'healthy', jsonb_build_object('endpoint', 'runtime-' || replace(role, '_agent', ''))
FROM runtime_agents
ON CONFLICT (route_key) DO NOTHING;

INSERT INTO runtime_connector_registry (connector_key, connector_kind, scope, auth_method, timeout_ms, free_first, status, metadata) VALUES
  ('supabase_db', 'database', '{"read":true,"write":true,"schema":"public"}', 'service_role', 30000, true, 'approved', '{}'),
  ('supabase_edge', 'edge_function', '{"functions":"runtime-*"}', 'service_role', 30000, true, 'approved', '{}'),
  ('browser_automation', 'browser', '{"verify_ui":true,"capture_screenshot":true}', 'none', 30000, true, 'approved', '{}'),
  ('repo_local', 'repo', '{"read":true}', 'none', 10000, true, 'approved', '{}'),
  ('mcp_public', 'mcp', '{"read":true}', 'none', 15000, true, 'approved', '{}')
ON CONFLICT (connector_key) DO NOTHING;

INSERT INTO runtime_approval_state (task_id, state, policy_checks, updated_at)
SELECT task_id,
  COALESCE(approval_state_obj->>'state', NULLIF(approval_state, ''), 'pending'),
  COALESCE(approval_state_obj->'policy_checks', '[]'::jsonb),
  COALESCE(updated_at, now())
FROM runtime_jobs
ON CONFLICT (task_id) DO NOTHING;

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('canonical_routes_tracked', 0),
  ('canonical_scores_recorded', 0),
  ('canonical_approvals_recorded', 0),
  ('coherence_violations_detected', 0),
  ('coherence_violations_resolved', 0),
  ('duplicate_owners_blocked', 0),
  ('connectors_registered', 0),
  ('connectors_quarantined', 0)
ON CONFLICT (metric_key) DO NOTHING;

UPDATE projection_metrics SET metric_value = (SELECT count(*) FROM runtime_route_state), updated_at = now() WHERE metric_key = 'canonical_routes_tracked';
UPDATE projection_metrics SET metric_value = (SELECT count(*) FROM runtime_approval_state), updated_at = now() WHERE metric_key = 'canonical_approvals_recorded';
UPDATE projection_metrics SET metric_value = (SELECT count(*) FROM runtime_connector_registry), updated_at = now() WHERE metric_key = 'connectors_registered';
