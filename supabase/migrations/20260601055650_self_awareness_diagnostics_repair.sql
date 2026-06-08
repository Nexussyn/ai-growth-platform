/*
  # Self-Awareness, Diagnostics, and Repair Infrastructure

  1. New Tables
    - `feature_failures` - Tracks detected non-functional features
      - `feature_name` (text) - Name of the feature that failed
      - `failure_type` (text) - Category of failure
      - `expected_behavior` (text) - What should happen
      - `actual_behavior` (text) - What actually happened
      - `severity` (text) - critical/high/medium/low
      - `detected_at` (timestamptz) - When detected
      - `repaired_at` (timestamptz) - When fixed
      - `repair_job_id` (text) - Reference to repair job
      - `status` (text) - open/repairing/repaired/wont_fix
    - `self_fault_registry` - Persistent failure families
      - `fault_family` (text, unique) - Family identifier
      - `first_seen_at` (timestamptz)
      - `last_seen_at` (timestamptz)
      - `occurrence_count` (integer)
      - `affected_modules` (text[])
      - `severity` (text)
      - `repair_strategy` (jsonb)
      - `auto_fix_enabled` (boolean)
      - `last_repair_attempt` (timestamptz)
      - `repair_success_count` (integer)
      - `repair_failure_count` (integer)
    - `repair_queue` - Auto-generated repair tasks
      - `repair_id` (text, unique) - Idempotency key
      - `feature_failure_id` (uuid) - FK to feature_failures
      - `fault_family` (text) - FK to self_fault_registry
      - `repair_type` (text) - Category of repair
      - `priority` (integer) - 1=highest
      - `status` (text) - pending/running/completed/failed/rolled_back
      - `repair_payload` (jsonb) - Instructions for repair
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `result` (jsonb)
      - `canary_passed` (boolean)
      - `rolled_back_at` (timestamptz)
    - `reality_check_runs` - Audit trail of reality checker executions
      - `run_id` (text)
      - `features_checked` (integer)
      - `failures_detected` (integer)
      - `repairs_queued` (integer)
      - `duration_ms` (integer)
      - `snapshot` (jsonb)

  2. Security
    - Enable RLS on all new tables
    - Service-role only access policies
*/

-- Feature failures table
CREATE TABLE IF NOT EXISTS feature_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL,
  failure_type text NOT NULL,
  expected_behavior text NOT NULL DEFAULT '',
  actual_behavior text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium',
  detected_at timestamptz NOT NULL DEFAULT now(),
  repaired_at timestamptz,
  repair_job_id text,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_failures"
  ON feature_failures FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Self fault registry table
CREATE TABLE IF NOT EXISTS self_fault_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_family text UNIQUE NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  affected_modules text[] NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium',
  repair_strategy jsonb DEFAULT '{}',
  auto_fix_enabled boolean NOT NULL DEFAULT true,
  last_repair_attempt timestamptz,
  repair_success_count integer NOT NULL DEFAULT 0,
  repair_failure_count integer NOT NULL DEFAULT 0,
  playbook jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE self_fault_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages self_fault_registry"
  ON self_fault_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Repair queue table
CREATE TABLE IF NOT EXISTS repair_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id text UNIQUE NOT NULL,
  feature_failure_id uuid REFERENCES feature_failures(id),
  fault_family text,
  repair_type text NOT NULL,
  priority integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  repair_payload jsonb DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb DEFAULT '{}',
  canary_passed boolean,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE repair_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages repair_queue"
  ON repair_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Reality check runs table
CREATE TABLE IF NOT EXISTS reality_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  features_checked integer NOT NULL DEFAULT 0,
  failures_detected integer NOT NULL DEFAULT 0,
  repairs_queued integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  snapshot jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reality_check_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages reality_check_runs"
  ON reality_check_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed fault families
INSERT INTO self_fault_registry (fault_family, severity, repair_strategy, auto_fix_enabled, affected_modules) VALUES
  ('dead_button_handler', 'high', '{"action": "wire_handler_to_api_route", "requires_redeploy": false}', true, ARRAY['frontend', 'edge_function']),
  ('fake_payment_flow', 'critical', '{"action": "verify_x402_settlement", "requires_redeploy": false}', true, ARRAY['payment', 'edge_function']),
  ('stuck_scheduler', 'high', '{"action": "restart_scheduler_tick", "requires_redeploy": false}', true, ARRAY['scheduler', 'orchestrator']),
  ('stuck_agent_status', 'medium', '{"action": "reset_agent_to_idle", "requires_redeploy": false}', true, ARRAY['agent_registry', 'agent_runs']),
  ('phase_not_advancing', 'high', '{"action": "evaluate_phase_thresholds_and_advance", "requires_redeploy": false}', true, ARRAY['growth_phases', 'orchestrator']),
  ('no_real_seo', 'medium', '{"action": "generate_seo_metadata", "requires_redeploy": true}', true, ARRAY['frontend', 'seo']),
  ('no_revenue_recorded', 'critical', '{"action": "verify_payment_ledger_pipeline", "requires_redeploy": false}', true, ARRAY['payment_ledger', 'system_metrics']),
  ('sim_state_without_db_state', 'high', '{"action": "replace_mock_with_db_query", "requires_redeploy": true}', true, ARRAY['frontend', 'edge_function']),
  ('recruiter_stalled', 'high', '{"action": "clear_blocking_findings_and_retry", "requires_redeploy": false}', true, ARRAY['recruiter', 'security_findings']),
  ('orphaned_ui_component', 'low', '{"action": "connect_or_remove_component", "requires_redeploy": true}', false, ARRAY['frontend']),
  ('zero_progress_loop', 'high', '{"action": "reset_loop_counter_and_force_tick", "requires_redeploy": false}', true, ARRAY['orchestrator', 'scheduler']),
  ('missing_reconciliation', 'medium', '{"action": "trigger_finance_agent", "requires_redeploy": false}', true, ARRAY['finance', 'reconciliation_status']),
  ('missing_discovery_endpoint', 'medium', '{"action": "verify_discovery_routes", "requires_redeploy": true}', true, ARRAY['edge_function', 'discovery'])
ON CONFLICT (fault_family) DO NOTHING;

-- Add reality_checker to scheduled_jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, max_retries, timeout_ms)
VALUES ('reality_checker', '*/2 * * * *', true, 2, 25000)
ON CONFLICT (job_name) DO UPDATE SET cron_expression = '*/2 * * * *', enabled = true;

-- Add auto_correction_engine to scheduled_jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, max_retries, timeout_ms)
VALUES ('auto_correction_engine', '*/3 * * * *', true, 2, 25000)
ON CONFLICT (job_name) DO UPDATE SET cron_expression = '*/3 * * * *', enabled = true;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_feature_failures_status ON feature_failures(status);
CREATE INDEX IF NOT EXISTS idx_feature_failures_severity ON feature_failures(severity);
CREATE INDEX IF NOT EXISTS idx_repair_queue_status ON repair_queue(status);
CREATE INDEX IF NOT EXISTS idx_repair_queue_priority ON repair_queue(priority);
CREATE INDEX IF NOT EXISTS idx_self_fault_registry_family ON self_fault_registry(fault_family);
