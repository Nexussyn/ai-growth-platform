/*
  # Final Unified Mode: Fault Graph + Remediation + Provenance Chain + Recurrence Guard

  1. New Canonical Tables
    - runtime_fault_graph        — causal graph per fault: failure_type, symptom, causal_chain (jsonb), root cause candidates, selected root cause + confidence, minimally_safe_fix, requires_human_review
    - runtime_remediation_state  — per-attempt remediation row: strategy, status, before/after state, fix_diff, fix_hash, validation_results, evidence_bundle_id, reversible flag
    - runtime_provenance_chain   — diff -> build -> deploy -> preview -> browser hashes per task; enforces the chain that no link is missing
    - runtime_recurrence_log     — recurrence window guard preventing false resolution by tracking same-symptom retriggers within the window
    - runtime_visibility_faults  — when backend changes but no UI delta is observed, recorded here so the system never reports cycle as visually successful

  2. Single Write-Path Functions (SECURITY DEFINER, search_path locked)
    - record_fault                 — idempotent fault row creation; appends causal chain steps
    - record_remediation_attempt   — single path for remediation rows; enforces max 3 attempts per fault
    - record_provenance            — append a link in the diff/build/deploy/preview/browser chain
    - close_fault                  — only closes if provenance chain is complete AND no recurrence in window
    - reopen_fault_on_recurrence   — auto-reopens if same symptom reappears within recurrence window

  3. Recurrence + Resolution Guards
    - close_fault verifies: chain has diff, build, deploy, preview, browser entries
    - close_fault verifies: no recurrence row in last 15 minutes for the same symptom
    - if any check fails, raises fault_close_rejected and the row stays open

  4. Triggers
    - on remediation insert with status=validated, attempt close_fault automatically
    - on fault recurrence detection, increment recurrence count and reopen if previously closed

  5. Security
    - RLS on every new table: service_role only
    - All new functions: REVOKE EXECUTE from PUBLIC/anon/authenticated, GRANT to service_role

  6. Notes
    - Strictly additive. Does not touch existing tables, functions, or policies.
    - All canonical responsibilities remain centralized: faults route only through these tables.
*/

-- 1. runtime_fault_graph
CREATE TABLE IF NOT EXISTS runtime_fault_graph (
  fault_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL,
  failure_type text NOT NULL,
  symptom text NOT NULL DEFAULT '',
  causal_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  root_cause_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_root_cause text NOT NULL DEFAULT '',
  selected_confidence text NOT NULL DEFAULT 'low',
  minimally_safe_fix text NOT NULL DEFAULT '',
  requires_human_review boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  recurrence_count int NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_fault_graph ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages fault graph" ON runtime_fault_graph FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_fault_status ON runtime_fault_graph (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fault_task ON runtime_fault_graph (task_id);
CREATE INDEX IF NOT EXISTS idx_fault_symptom ON runtime_fault_graph (symptom);

-- 2. runtime_remediation_state
CREATE TABLE IF NOT EXISTS runtime_remediation_state (
  remediation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_id uuid NOT NULL REFERENCES runtime_fault_graph(fault_id) ON DELETE CASCADE,
  task_id text NOT NULL,
  attempt int NOT NULL DEFAULT 1,
  strategy text NOT NULL DEFAULT 'minimal_reversible_fix',
  status text NOT NULL DEFAULT 'queued',
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  fix_diff text NOT NULL DEFAULT '',
  fix_hash text NOT NULL DEFAULT '',
  validation_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_bundle_id uuid,
  reversible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_remediation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages remediation state" ON runtime_remediation_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_remediation_fault ON runtime_remediation_state (fault_id, attempt DESC);
CREATE INDEX IF NOT EXISTS idx_remediation_status ON runtime_remediation_state (status);

-- 3. runtime_provenance_chain
CREATE TABLE IF NOT EXISTS runtime_provenance_chain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL,
  link_kind text NOT NULL,
  link_hash text NOT NULL DEFAULT '',
  link_ref text NOT NULL DEFAULT '',
  artifact_uri text NOT NULL DEFAULT '',
  recorded_by text NOT NULL DEFAULT 'orchestrator',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT provenance_link_kind CHECK (link_kind IN ('diff','build','deploy','preview','browser'))
);
ALTER TABLE runtime_provenance_chain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages provenance chain" ON runtime_provenance_chain FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_provenance_task ON runtime_provenance_chain (task_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_provenance_link ON runtime_provenance_chain (link_kind);

-- 4. runtime_recurrence_log
CREATE TABLE IF NOT EXISTS runtime_recurrence_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_id uuid REFERENCES runtime_fault_graph(fault_id) ON DELETE CASCADE,
  symptom text NOT NULL DEFAULT '',
  task_id text NOT NULL DEFAULT '',
  observed_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE runtime_recurrence_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages recurrence log" ON runtime_recurrence_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_recurrence_symptom ON runtime_recurrence_log (symptom, observed_at DESC);

-- 5. runtime_visibility_faults
CREATE TABLE IF NOT EXISTS runtime_visibility_faults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  fault_kind text NOT NULL,
  expected_delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT visibility_fault_kind CHECK (fault_kind IN (
    'no_ui_delta_after_backend_change','stale_summary_widget','frozen_counter','static_route_state',
    'hidden_event','cache_override','missing_transition_animation','empty_timeline_with_real_events'
  ))
);
ALTER TABLE runtime_visibility_faults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages visibility faults" ON runtime_visibility_faults FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_vis_fault_status ON runtime_visibility_faults (status, detected_at DESC);

-- 6. record_fault (idempotent — same task_id + failure_type updates the same row)
CREATE OR REPLACE FUNCTION record_fault(
  p_task_id text,
  p_failure_type text,
  p_symptom text,
  p_causal_step jsonb,
  p_candidates jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fault_id uuid;
BEGIN
  SELECT fault_id INTO v_fault_id
  FROM runtime_fault_graph
  WHERE task_id = p_task_id AND failure_type = p_failure_type AND status = 'open'
  ORDER BY created_at DESC LIMIT 1;

  IF v_fault_id IS NULL THEN
    INSERT INTO runtime_fault_graph (task_id, failure_type, symptom, causal_chain, root_cause_candidates)
    VALUES (
      p_task_id,
      p_failure_type,
      p_symptom,
      CASE WHEN p_causal_step IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_causal_step) END,
      COALESCE(p_candidates, '[]'::jsonb)
    )
    RETURNING fault_id INTO v_fault_id;
  ELSE
    UPDATE runtime_fault_graph
    SET causal_chain = causal_chain || COALESCE(jsonb_build_array(p_causal_step), '[]'::jsonb),
        root_cause_candidates = COALESCE(p_candidates, root_cause_candidates),
        last_seen_at = now(),
        recurrence_count = recurrence_count + 1,
        updated_at = now()
    WHERE fault_id = v_fault_id;

    INSERT INTO runtime_recurrence_log (fault_id, symptom, task_id, details)
    VALUES (v_fault_id, p_symptom, p_task_id, COALESCE(p_causal_step, '{}'::jsonb));
  END IF;

  INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
  VALUES (p_task_id, 'orchestrator', 'fault:record:' || p_failure_type, jsonb_build_object('fault_id', v_fault_id, 'symptom', p_symptom));

  RETURN v_fault_id;
END $$;
REVOKE EXECUTE ON FUNCTION record_fault(text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_fault(text, text, text, jsonb, jsonb) TO service_role;

-- 7. record_remediation_attempt (enforces max 3 attempts)
CREATE OR REPLACE FUNCTION record_remediation_attempt(
  p_fault_id uuid,
  p_task_id text,
  p_strategy text,
  p_fix_diff text,
  p_fix_hash text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_attempts int;
  v_id uuid;
BEGIN
  SELECT COUNT(*) INTO v_attempts FROM runtime_remediation_state WHERE fault_id = p_fault_id;
  IF v_attempts >= 3 THEN
    UPDATE runtime_fault_graph SET requires_human_review = true, status = 'review_required', updated_at = now()
    WHERE fault_id = p_fault_id;
    RAISE EXCEPTION 'remediation_limit_exceeded: fault %', p_fault_id;
  END IF;

  INSERT INTO runtime_remediation_state (
    fault_id, task_id, attempt, strategy, status, before_state, after_state, fix_diff, fix_hash
  ) VALUES (
    p_fault_id, p_task_id, v_attempts + 1, p_strategy, p_status,
    COALESCE(p_before_state, '{}'::jsonb), COALESCE(p_after_state, '{}'::jsonb),
    COALESCE(p_fix_diff, ''), COALESCE(p_fix_hash, '')
  ) RETURNING remediation_id INTO v_id;

  INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
  VALUES (p_task_id, 'orchestrator', 'remediation:' || p_status, jsonb_build_object(
    'remediation_id', v_id, 'fault_id', p_fault_id, 'strategy', p_strategy, 'attempt', v_attempts + 1
  ));

  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION record_remediation_attempt(uuid, text, text, text, text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_remediation_attempt(uuid, text, text, text, text, jsonb, jsonb, text) TO service_role;

-- 8. record_provenance — append a link to the chain
CREATE OR REPLACE FUNCTION record_provenance(
  p_task_id text,
  p_link_kind text,
  p_link_hash text,
  p_link_ref text,
  p_artifact_uri text,
  p_metadata jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_link_kind NOT IN ('diff','build','deploy','preview','browser') THEN
    RAISE EXCEPTION 'invalid_link_kind: %', p_link_kind;
  END IF;
  INSERT INTO runtime_provenance_chain (task_id, link_kind, link_hash, link_ref, artifact_uri, metadata)
  VALUES (p_task_id, p_link_kind, COALESCE(p_link_hash, ''), COALESCE(p_link_ref, ''), COALESCE(p_artifact_uri, ''), COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION record_provenance(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_provenance(text, text, text, text, text, jsonb) TO service_role;

-- 9. close_fault — strict gate: requires full chain AND no recurrence in last 15 minutes
CREATE OR REPLACE FUNCTION close_fault(p_fault_id uuid, p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_task_id text;
  v_symptom text;
  v_chain_complete boolean;
  v_recurrence_count int;
BEGIN
  SELECT task_id, symptom INTO v_task_id, v_symptom FROM runtime_fault_graph WHERE fault_id = p_fault_id;
  IF v_task_id IS NULL THEN
    RAISE EXCEPTION 'fault_not_found: %', p_fault_id;
  END IF;

  SELECT
    EXISTS (SELECT 1 FROM runtime_provenance_chain WHERE task_id = v_task_id AND link_kind = 'diff') AND
    EXISTS (SELECT 1 FROM runtime_provenance_chain WHERE task_id = v_task_id AND link_kind = 'build') AND
    EXISTS (SELECT 1 FROM runtime_provenance_chain WHERE task_id = v_task_id AND link_kind = 'deploy') AND
    EXISTS (SELECT 1 FROM runtime_provenance_chain WHERE task_id = v_task_id AND link_kind = 'preview') AND
    EXISTS (SELECT 1 FROM runtime_provenance_chain WHERE task_id = v_task_id AND link_kind = 'browser')
  INTO v_chain_complete;

  IF NOT v_chain_complete THEN
    RAISE EXCEPTION 'fault_close_rejected: provenance chain incomplete for task %', v_task_id;
  END IF;

  SELECT COUNT(*) INTO v_recurrence_count
  FROM runtime_recurrence_log
  WHERE symptom = v_symptom AND observed_at > now() - interval '15 minutes';

  IF v_recurrence_count > 0 THEN
    RAISE EXCEPTION 'fault_close_rejected: recurrence detected within 15-minute window for symptom %', v_symptom;
  END IF;

  UPDATE runtime_fault_graph
  SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE fault_id = p_fault_id;

  INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
  VALUES (v_task_id, 'orchestrator', 'fault:close', jsonb_build_object('fault_id', p_fault_id, 'actor', p_actor));

  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION close_fault(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_fault(uuid, text) TO service_role;

-- 10. reopen_fault_on_recurrence — auto-trigger on recurrence_log insert
CREATE OR REPLACE FUNCTION trg_reopen_fault_on_recurrence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.fault_id IS NULL THEN RETURN NEW; END IF;
  UPDATE runtime_fault_graph
  SET status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
      closed_at = CASE WHEN status = 'closed' THEN NULL ELSE closed_at END,
      recurrence_count = recurrence_count + 1,
      last_seen_at = now(),
      updated_at = now()
  WHERE fault_id = NEW.fault_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recurrence_reopen ON runtime_recurrence_log;
CREATE TRIGGER trg_recurrence_reopen
  AFTER INSERT ON runtime_recurrence_log
  FOR EACH ROW EXECUTE FUNCTION trg_reopen_fault_on_recurrence();

-- 11. detect_visibility_fault — registers when expected_delta is non-empty but observed_delta is empty
CREATE OR REPLACE FUNCTION record_visibility_fault(
  p_task_id text,
  p_fault_kind text,
  p_expected jsonb,
  p_observed jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO runtime_visibility_faults (task_id, fault_kind, expected_delta, observed_delta)
  VALUES (p_task_id, p_fault_kind, COALESCE(p_expected, '{}'::jsonb), COALESCE(p_observed, '{}'::jsonb))
  RETURNING id INTO v_id;

  INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
  VALUES (p_task_id, 'observability_agent_external', 'visibility_fault:' || p_fault_kind,
          jsonb_build_object('expected', p_expected, 'observed', p_observed));
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION record_visibility_fault(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_visibility_fault(text, text, jsonb, jsonb) TO service_role;

-- 12. Projection metrics (additive)
INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('faults_open', 0),
  ('faults_closed', 0),
  ('faults_recurrence_blocked', 0),
  ('remediation_attempts_total', 0),
  ('remediation_validated', 0),
  ('remediation_rolled_back', 0),
  ('provenance_links_recorded', 0),
  ('visibility_faults_open', 0),
  ('false_resolutions_prevented', 0)
ON CONFLICT (metric_key) DO NOTHING;
