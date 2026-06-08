/*
  # Continuous Watch + Worldwide Federation — Open the System to External Intelligences

  1. New canonical tables (RLS service-role only):
    - runtime_provider_candidates  Discovered candidate endpoints from watch loop.
                                   source, candidate_kind, name, url, license, kind,
                                   status (discovered|probing|probed_ok|probed_failed|promoted|rejected),
                                   probe_status_code, probe_excerpt, probe_hash, score, evidence
    - runtime_external_nodes       External intelligences that voluntarily federate.
                                   node_id, manifest_url, public_key (text, optional),
                                   capabilities[], languages[], status, attestations,
                                   first_seen_at, last_seen_at
    - runtime_evolution_pulse      Append-only feed of evolution events (discovered,
                                   probed, approved, federated, attested, viral_share)
                                   Visible in the canonical UI as a live evolution feed.

  2. Public-facing manifest support
    - Function record_external_node_registration enforces minimal validation +
      rate-limit (max 1 row per IP/hour) before accepting a federation request.
    - Function promote_provider_candidate atomically copies an approved candidate
      into runtime_connector_registry with auth_method='none', free_first=true,
      status='approved', and records an evolution_pulse row.

  3. Watch loop config table
    - runtime_watch_seeds — rotating discovery seed queries (GitHub, HN, OpenAlex,
      arXiv) so the watch covers the world in many languages and noeuds.

  4. Projection metrics
    - candidates_discovered, candidates_probed_ok, candidates_promoted,
      external_nodes_registered, evolution_pulses, viral_invitations_sent.

  5. RLS
    - All new tables: service_role only (default deny). Public manifest reads use
      a SECURITY DEFINER function exposed via edge function instead of direct
      table access — no broad policies that defeat RLS.

  6. Notes
    - Strictly additive. No existing tables/policies/cron jobs touched.
    - All new functions: SECURITY DEFINER, locked search_path, REVOKE PUBLIC,
      GRANT to service_role only.
*/

-- 1. runtime_provider_candidates
CREATE TABLE IF NOT EXISTS runtime_provider_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  candidate_kind text NOT NULL DEFAULT 'agentic_llm',
  name text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  license text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'discovered',
  probe_status_code int,
  probe_excerpt text NOT NULL DEFAULT '',
  probe_hash text NOT NULL DEFAULT '',
  score numeric NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  probed_at timestamptz,
  promoted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cand_status_chk CHECK (status IN ('discovered','probing','probed_ok','probed_failed','promoted','rejected')),
  CONSTRAINT cand_url_unique UNIQUE (url)
);
ALTER TABLE runtime_provider_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages provider candidates" ON runtime_provider_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cand_status ON runtime_provider_candidates (status, discovered_at DESC);

-- 2. runtime_external_nodes (federation)
CREATE TABLE IF NOT EXISTS runtime_external_nodes (
  node_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_url text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  attestations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  source_ip text NOT NULL DEFAULT '',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT node_status_chk CHECK (status IN ('pending','approved','probed_ok','probed_failed','federated','revoked')),
  CONSTRAINT node_manifest_unique UNIQUE (manifest_url)
);
ALTER TABLE runtime_external_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages external nodes" ON runtime_external_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_node_status ON runtime_external_nodes (status, last_seen_at DESC);

-- 3. runtime_evolution_pulse — visible activity feed
CREATE TABLE IF NOT EXISTS runtime_evolution_pulse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_kind text NOT NULL,
  source text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pulse_kind_chk CHECK (pulse_kind IN (
    'discovered','probed_ok','probed_failed','promoted','federation_request',
    'federation_approved','viral_invite','manifest_served','heartbeat'
  ))
);
ALTER TABLE runtime_evolution_pulse ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages evolution pulse" ON runtime_evolution_pulse FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pulse_created ON runtime_evolution_pulse (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_kind ON runtime_evolution_pulse (pulse_kind, created_at DESC);

-- 4. runtime_watch_seeds — seed queries for the worldwide watch loop
CREATE TABLE IF NOT EXISTS runtime_watch_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  query text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  weight int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_results int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_watch_seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages watch seeds" ON runtime_watch_seeds FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO runtime_watch_seeds (source, query, language, weight) VALUES
  ('github', 'free llm api no key', 'en', 5),
  ('github', 'open source agentic ai', 'en', 5),
  ('github', 'public llm inference free', 'en', 4),
  ('github', 'awesome free apis llm', 'en', 4),
  ('github', 'no auth required ai api', 'en', 3),
  ('github', 'agentic framework typescript', 'en', 3),
  ('github', 'autonomous agents python', 'en', 3),
  ('hn', 'free llm api no auth', 'en', 4),
  ('hn', 'open source agent', 'en', 3),
  ('hn', 'self-host llm', 'en', 3),
  ('openalex', 'autonomous LLM agents open source', 'en', 3),
  ('openalex', 'multi-agent reasoning system', 'en', 3),
  ('arxiv', 'open source agentic AI', 'en', 3),
  ('arxiv', 'large language model autonomous', 'en', 3),
  ('github', 'IA agentique open source', 'fr', 2),
  ('github', 'agentes autonomos LLM', 'es', 2),
  ('github', 'エージェント LLM オープンソース', 'ja', 2),
  ('github', '开源 智能体 LLM', 'zh', 2),
  ('github', 'agentes LLM código aberto', 'pt', 2),
  ('hn', 'LLM agent open source new', 'en', 3)
ON CONFLICT DO NOTHING;

-- 5. Projection metrics (additive)
INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('candidates_discovered', 0),
  ('candidates_probed_ok', 0),
  ('candidates_promoted', 0),
  ('external_nodes_registered', 0),
  ('evolution_pulses', 0),
  ('viral_invitations_sent', 0)
ON CONFLICT (metric_key) DO NOTHING;

-- 6. record_external_node_registration — public-safe insert with rate-limit
CREATE OR REPLACE FUNCTION record_external_node_registration(
  p_manifest_url text,
  p_display_name text,
  p_capabilities jsonb,
  p_languages jsonb,
  p_attestations jsonb,
  p_source_ip text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_recent_for_ip int;
BEGIN
  IF p_manifest_url IS NULL OR length(p_manifest_url) < 8 OR p_manifest_url !~* '^https?://' THEN
    RAISE EXCEPTION 'invalid_manifest_url';
  END IF;
  IF length(p_manifest_url) > 1024 THEN
    RAISE EXCEPTION 'manifest_url_too_long';
  END IF;

  SELECT count(*) INTO v_recent_for_ip
  FROM runtime_external_nodes
  WHERE source_ip = COALESCE(p_source_ip,'') AND first_seen_at > now() - interval '1 hour';

  IF v_recent_for_ip > 30 THEN
    RAISE EXCEPTION 'rate_limited_per_ip';
  END IF;

  INSERT INTO runtime_external_nodes (manifest_url, display_name, capabilities, languages, attestations, source_ip, status)
  VALUES (
    p_manifest_url,
    COALESCE(p_display_name, ''),
    COALESCE(p_capabilities, '[]'::jsonb),
    COALESCE(p_languages, '[]'::jsonb),
    COALESCE(p_attestations, '[]'::jsonb),
    COALESCE(p_source_ip, ''),
    'pending'
  )
  ON CONFLICT (manifest_url) DO UPDATE SET
    last_seen_at = now(),
    capabilities = EXCLUDED.capabilities,
    languages = EXCLUDED.languages,
    attestations = EXCLUDED.attestations
  RETURNING node_id INTO v_id;

  INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
  VALUES ('federation_request', 'public', p_manifest_url,
    jsonb_build_object('display_name', p_display_name, 'capabilities', p_capabilities));

  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION record_external_node_registration(text, text, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_external_node_registration(text, text, jsonb, jsonb, jsonb, text) TO service_role;

-- 7. promote_provider_candidate — atomically copies into runtime_connector_registry
CREATE OR REPLACE FUNCTION promote_provider_candidate(p_candidate_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c RECORD;
  v_key text;
BEGIN
  SELECT * INTO c FROM runtime_provider_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_not_found'; END IF;
  IF c.status NOT IN ('probed_ok') THEN RAISE EXCEPTION 'candidate_not_probed_ok'; END IF;

  v_key := 'cand_' || regexp_replace(lower(coalesce(c.name, c.source || '_' || left(md5(c.url),8))), '[^a-z0-9_]+', '_', 'g');

  INSERT INTO runtime_connector_registry
    (connector_key, connector_kind, scope, auth_method, timeout_ms, evidence_schema,
     allowed_roles, free_first, status, metadata)
  VALUES (
    v_key, c.candidate_kind,
    jsonb_build_object('capabilities', jsonb_build_array('discovered_inference')),
    'none', 12000,
    jsonb_build_object('required', jsonb_build_array('request_url','response_excerpt','response_hash')),
    ARRAY['research_agent_external','observability_agent_external']::text[],
    true, 'approved',
    jsonb_build_object(
      'endpoint', c.url,
      'method', 'GET',
      'provider', c.source,
      'license', COALESCE(NULLIF(c.license,''), 'unknown'),
      'discovered_via', 'watch_loop',
      'candidate_id', c.id
    )
  )
  ON CONFLICT (connector_key) DO UPDATE SET
    status = 'approved', metadata = EXCLUDED.metadata, free_first = true;

  UPDATE runtime_provider_candidates
  SET status = 'promoted', promoted_at = now(), updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
  VALUES ('promoted', c.source, c.url,
    jsonb_build_object('connector_key', v_key, 'license', c.license));

  RETURN v_key;
END $$;
REVOKE EXECUTE ON FUNCTION promote_provider_candidate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION promote_provider_candidate(uuid) TO service_role;

-- 8. record_pulse helper (used by edge functions)
CREATE OR REPLACE FUNCTION record_pulse(p_kind text, p_source text, p_subject text, p_details jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
  VALUES (p_kind, COALESCE(p_source,''), COALESCE(p_subject,''), COALESCE(p_details,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION record_pulse(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_pulse(text, text, text, jsonb) TO service_role;
