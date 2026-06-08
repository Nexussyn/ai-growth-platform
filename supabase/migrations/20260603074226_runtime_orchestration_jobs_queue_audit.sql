/*
  # System Orchestration — Runtime Jobs Queue & Audit Infrastructure

  1. New Tables
    - `runtime_jobs` — durable job queue routed by orchestrator
      - `id` (uuid pk), `task_id` (text unique), `agent_role` (text), `target` (text), `scope` (text)
      - `success_metric` (text), `risk_level` (text), `rollback_plan` (text)
      - `approval_state` (text: pending/approved/blocked), `status` (text: queued/running/completed/failed/dead_letter)
      - `payload` (jsonb), `result` (jsonb), `evidence` (jsonb)
      - `attempts` (int), `max_attempts` (int default 3)
      - `correlation_id` (text), `parent_task_id` (text nullable)
      - timestamps for created/started/completed

    - `runtime_audit_log` — full traceability for every agent action
      - `id` (uuid pk), `task_id` (text), `agent_role` (text), `action` (text)
      - `diff_or_effect` (jsonb), `evidence` (jsonb), `error` (text, nullable)
      - `before_state` (jsonb), `after_state` (jsonb)
      - `created_at` (timestamptz)

    - `runtime_agents` — registered agents and their capabilities
      - `role` (text pk), `endpoint_url` (text), `permissions` (jsonb), `enabled` (boolean)
      - `last_heartbeat` (timestamptz)

    - `runtime_artifacts` — approved deployment artifacts
      - `id` (uuid pk), `task_id` (text), `kind` (text: code_diff/migration/config)
      - `content` (text), `hash` (text), `approved_by` (text), `approved_at` (timestamptz)
      - `deployed` (boolean), `deployed_at` (timestamptz nullable)

    - `runtime_rollback_points` — known-good states for rollback
      - `id` (uuid pk), `tag` (text), `state_snapshot` (jsonb), `created_at` (timestamptz)

  2. New Projection Metrics
    - `orchestrator_jobs_routed` — total jobs routed
    - `orchestrator_jobs_completed`, `orchestrator_jobs_failed`, `orchestrator_jobs_dead_lettered`
    - `agent_actions_<role>` — per-agent action counts
    - `rollbacks_executed`, `security_blocks`, `qa_failures`

  3. Security
    - RLS on all new tables, service_role only

  4. Notes
    - The orchestrator inserts jobs; specialized agents poll/receive and execute
    - Every state change goes through runtime_audit_log
    - Rollback points enable safe reversion
*/

CREATE TABLE IF NOT EXISTS runtime_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  agent_role text NOT NULL DEFAULT 'orchestrator',
  target text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT '',
  success_metric text NOT NULL DEFAULT '',
  risk_level text NOT NULL DEFAULT 'low',
  rollback_plan text NOT NULL DEFAULT 'no-op',
  approval_state text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  correlation_id text NOT NULL DEFAULT '',
  parent_task_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE runtime_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages runtime jobs"
  ON runtime_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_runtime_jobs_status ON runtime_jobs (status, agent_role, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_jobs_correlation ON runtime_jobs (correlation_id);

CREATE TABLE IF NOT EXISTS runtime_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  agent_role text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  diff_or_effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages runtime audit log"
  ON runtime_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_runtime_audit_task ON runtime_audit_log (task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_agents (
  role text PRIMARY KEY,
  endpoint_url text NOT NULL DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages runtime agents"
  ON runtime_agents FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'code_diff',
  content text NOT NULL DEFAULT '',
  hash text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  approved_at timestamptz,
  deployed boolean NOT NULL DEFAULT false,
  deployed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages runtime artifacts"
  ON runtime_artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_rollback_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL DEFAULT '',
  state_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_rollback_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rollback points"
  ON runtime_rollback_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Register the 8 specialized agents (each will populate its endpoint_url at boot)
INSERT INTO runtime_agents (role, endpoint_url, permissions) VALUES
  ('orchestrator', '/functions/v1/runtime-discovery', '["route", "rank", "stop"]'::jsonb),
  ('code_agent', '/functions/v1/runtime-code-edit', '["propose_diff"]'::jsonb),
  ('db_agent', '/functions/v1/runtime-db-migrate', '["propose_migration"]'::jsonb),
  ('qa_agent', '/functions/v1/runtime-qa', '["run_tests", "preview_check"]'::jsonb),
  ('security_agent', '/functions/v1/runtime-security', '["block", "approve"]'::jsonb),
  ('deploy_agent', '/functions/v1/runtime-deploy', '["apply_approved_artifact"]'::jsonb),
  ('observability_agent', '/functions/v1/runtime-observability', '["log", "snapshot", "screenshot"]'::jsonb),
  ('rollback_agent', '/functions/v1/runtime-rollback', '["restore_known_good"]'::jsonb)
ON CONFLICT (role) DO NOTHING;

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('orchestrator_jobs_routed', 0),
  ('orchestrator_jobs_completed', 0),
  ('orchestrator_jobs_failed', 0),
  ('orchestrator_jobs_dead_lettered', 0),
  ('agent_actions_code_agent', 0),
  ('agent_actions_db_agent', 0),
  ('agent_actions_qa_agent', 0),
  ('agent_actions_security_agent', 0),
  ('agent_actions_deploy_agent', 0),
  ('agent_actions_observability_agent', 0),
  ('agent_actions_rollback_agent', 0),
  ('rollbacks_executed', 0),
  ('security_blocks', 0),
  ('qa_failures', 0)
ON CONFLICT (metric_key) DO NOTHING;
