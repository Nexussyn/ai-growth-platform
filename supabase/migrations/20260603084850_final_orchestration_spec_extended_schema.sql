/*
  # Final Specification — Extended Orchestration Schema

  1. Modified Table: `runtime_jobs`
    - Add fields: task_kind, priority (int), target_obj/scope_obj/success_metric_obj (jsonb)
    - Add fields: timeout_ms, retries, evidence_required (jsonb array)
    - Add fields: external_agent_class, external_endpoint_name, external_contract_version
    - Add fields: budget_mode (free_first/paid_allowed/blocked), source_class, source_constraints (jsonb)
    - Add fields: stop_conditions (jsonb), updated_at
    - Adds approval_state_obj jsonb for richer approval tracking

  2. New Table: `runtime_evidence_bundles`
    - Stores evidence bundles for every impactful action
    - bundle_id, task_id, bundle_type, collected_by, before/after state, artifacts, validation

  3. New Table: `runtime_budget`
    - Singleton-style budget control: total_revenue, paid_unlocked, monthly_cap, spent_to_date
    - Tracks free-to-paid transition state

  4. New Table: `runtime_source_history`
    - Tracks source classes used in discovery — detects repeated_source_loop stop condition

  5. New Table: `runtime_external_calls`
    - Logs every external API call with attribution and reversibility metadata

  6. New Table: `runtime_outreach_log`
    - Lawful outreach attempts and replies (with consent metadata)

  7. New Table: `runtime_procurement_catalog`
    - Discovered tools/vendors/MCP servers in free or paid tier

  8. Initial Data
    - Insert the 15 specialized agents into runtime_agents
    - Initialize runtime_budget with free-first policy
    - Add new projection metrics for each new agent class

  9. Security
    - RLS on all new tables, service_role only

  10. Notes
    - All additions are additive — existing rows keep working
    - free-first policy enforced via runtime_budget.paid_unlocked default false
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'task_kind') THEN
    ALTER TABLE runtime_jobs ADD COLUMN task_kind text NOT NULL DEFAULT 'discovery';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'priority') THEN
    ALTER TABLE runtime_jobs ADD COLUMN priority int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'target_obj') THEN
    ALTER TABLE runtime_jobs ADD COLUMN target_obj jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'scope_obj') THEN
    ALTER TABLE runtime_jobs ADD COLUMN scope_obj jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'success_metric_obj') THEN
    ALTER TABLE runtime_jobs ADD COLUMN success_metric_obj jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'timeout_ms') THEN
    ALTER TABLE runtime_jobs ADD COLUMN timeout_ms int NOT NULL DEFAULT 30000;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'retries') THEN
    ALTER TABLE runtime_jobs ADD COLUMN retries int NOT NULL DEFAULT 3;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'evidence_required') THEN
    ALTER TABLE runtime_jobs ADD COLUMN evidence_required jsonb NOT NULL DEFAULT '["log"]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'external_agent_class') THEN
    ALTER TABLE runtime_jobs ADD COLUMN external_agent_class text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'external_endpoint_name') THEN
    ALTER TABLE runtime_jobs ADD COLUMN external_endpoint_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'external_contract_version') THEN
    ALTER TABLE runtime_jobs ADD COLUMN external_contract_version text NOT NULL DEFAULT 'v1';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'budget_mode') THEN
    ALTER TABLE runtime_jobs ADD COLUMN budget_mode text NOT NULL DEFAULT 'free_first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'source_class') THEN
    ALTER TABLE runtime_jobs ADD COLUMN source_class text NOT NULL DEFAULT 'internal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'source_constraints') THEN
    ALTER TABLE runtime_jobs ADD COLUMN source_constraints jsonb NOT NULL DEFAULT '{"allowed":[],"forbidden":[]}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'stop_conditions') THEN
    ALTER TABLE runtime_jobs ADD COLUMN stop_conditions jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'approval_state_obj') THEN
    ALTER TABLE runtime_jobs ADD COLUMN approval_state_obj jsonb NOT NULL DEFAULT '{"state":"pending","policy_checks":[]}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'runtime_jobs' AND column_name = 'updated_at') THEN
    ALTER TABLE runtime_jobs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS runtime_evidence_bundles (
  evidence_bundle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  bundle_type text NOT NULL DEFAULT 'audit',
  collected_by text NOT NULL DEFAULT '',
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{"passed":true,"checks":[],"notes":null}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_evidence_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages evidence bundles" ON runtime_evidence_bundles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON runtime_evidence_bundles (task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_budget (
  id int PRIMARY KEY DEFAULT 1,
  total_revenue_cents bigint NOT NULL DEFAULT 0,
  paid_unlocked boolean NOT NULL DEFAULT false,
  monthly_cap_cents bigint NOT NULL DEFAULT 0,
  spent_to_date_cents bigint NOT NULL DEFAULT 0,
  finance_approved boolean NOT NULL DEFAULT false,
  security_approved_for_paid boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz,
  unlocked_reason text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages budget" ON runtime_budget FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO runtime_budget (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS runtime_source_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  source_class text NOT NULL DEFAULT 'internal',
  source_signature text NOT NULL DEFAULT '',
  produced_evidence boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_source_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages source history" ON runtime_source_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_source_signature ON runtime_source_history (source_signature, created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_external_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  agent_role text NOT NULL DEFAULT '',
  connector text NOT NULL DEFAULT '',
  endpoint text NOT NULL DEFAULT '',
  cost_cents int NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT false,
  status_code int,
  response_hash text NOT NULL DEFAULT '',
  reversible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_external_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages external calls" ON runtime_external_calls FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_outreach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'email',
  target_handle text NOT NULL DEFAULT '',
  message_hash text NOT NULL DEFAULT '',
  consent_basis text NOT NULL DEFAULT 'inbound_only',
  status text NOT NULL DEFAULT 'queued',
  reply_received boolean NOT NULL DEFAULT false,
  reply_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_outreach_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages outreach log" ON runtime_outreach_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_procurement_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  tier text NOT NULL DEFAULT 'free',
  endpoint text NOT NULL DEFAULT '',
  monthly_cost_cents int NOT NULL DEFAULT 0,
  capability_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  discovered_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE runtime_procurement_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages procurement catalog" ON runtime_procurement_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Register the additional 7 specialized agents (15 total)
INSERT INTO runtime_agents (role, endpoint_url, permissions) VALUES
  ('broker_agent', '/functions/v1/runtime-broker', '["dispatch", "rebalance"]'::jsonb),
  ('browser_agent_external', '/functions/v1/runtime-browser', '["inspect_dom", "screenshot", "form_check"]'::jsonb),
  ('integration_agent_external', '/functions/v1/runtime-integration', '["wire_api", "register_webhook"]'::jsonb),
  ('outreach_agent_external', '/functions/v1/runtime-outreach', '["lawful_outreach", "log_replies"]'::jsonb),
  ('procurement_agent_external', '/functions/v1/runtime-procurement', '["catalog_vendors", "find_mcp"]'::jsonb),
  ('research_agent_external', '/functions/v1/runtime-research', '["scan_capabilities", "propose_integration"]'::jsonb),
  ('finance_agent_external', '/functions/v1/runtime-finance', '["budget_control", "unlock_paid"]'::jsonb)
ON CONFLICT (role) DO NOTHING;

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('agent_actions_broker_agent', 0),
  ('agent_actions_browser_agent_external', 0),
  ('agent_actions_integration_agent_external', 0),
  ('agent_actions_outreach_agent_external', 0),
  ('agent_actions_procurement_agent_external', 0),
  ('agent_actions_research_agent_external', 0),
  ('agent_actions_finance_agent_external', 0),
  ('source_loops_detected', 0),
  ('paid_intelligence_unlock_attempts', 0),
  ('paid_intelligence_unlocks', 0),
  ('evidence_bundles_collected', 0),
  ('outreach_messages_sent', 0),
  ('procurement_items_cataloged', 0),
  ('research_items_proposed', 0),
  ('integration_wirings_completed', 0)
ON CONFLICT (metric_key) DO NOTHING;

-- Seed procurement catalog with free-first MCPs and connectors (Phase 1)
INSERT INTO runtime_procurement_catalog (name, category, tier, endpoint, capability_tags, approved, notes) VALUES
  ('Browser MCP (Playwright)', 'browser_automation', 'free', 'mcp://browser', '["dom","screenshot","form"]'::jsonb, true, 'Open-source headless browser'),
  ('GitHub MCP', 'repo', 'free', 'mcp://github', '["repo","commits","prs"]'::jsonb, true, 'Free public repo access'),
  ('Supabase MCP', 'db', 'free', 'mcp://supabase', '["db","auth","functions"]'::jsonb, true, 'Built-in connector'),
  ('Postgres MCP', 'db', 'free', 'mcp://postgres', '["sql","schema"]'::jsonb, true, 'Direct DB access'),
  ('Public scraping MCP', 'extraction', 'free', 'mcp://scrape', '["html","extract"]'::jsonb, true, 'Free-tier extraction'),
  ('Observability MCP', 'observability', 'free', 'mcp://obs', '["logs","metrics","traces"]'::jsonb, true, 'Internal evidence capture'),
  ('Free email connector', 'email', 'free', 'mcp://email-free', '["smtp","inbox"]'::jsonb, true, 'Free-tier transactional email'),
  ('Webhook connector', 'webhook', 'free', 'mcp://webhook', '["receive","forward"]'::jsonb, true, 'Generic webhook bridge'),
  ('jsonplaceholder API', 'api', 'free', 'https://jsonplaceholder.typicode.com', '["test_api"]'::jsonb, true, 'Free testing API'),
  ('exchangerate-api', 'api', 'free', 'https://api.exchangerate-api.com', '["fx"]'::jsonb, true, 'Free FX data')
ON CONFLICT DO NOTHING;
