/*
  # Self-Replication Infrastructure & Agent Federation

  1. New Tables
    - `instance_registry` - tracks all deployed system instances
    - `replication_events` - log of replication attempts
    - `external_applications` - external agents applying to join
    - `sandbox_trials` - task trials for applicants
    - `agent_scores` - ongoing performance scores

  2. Security
    - All tables RLS enabled
    - Service role write access
    - Anon read for public discovery
*/

CREATE TABLE IF NOT EXISTS instance_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id text UNIQUE NOT NULL DEFAULT '',
  parent_instance_id text DEFAULT 'root',
  environment_name text NOT NULL DEFAULT 'replit',
  deployment_url text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  replication_reason text DEFAULT 'initial_deployment',
  revenue_destination_hash text NOT NULL DEFAULT '',
  safety_score numeric DEFAULT 100,
  capabilities jsonb DEFAULT '{"payments":true,"realtime":true,"queue":true,"secrets":true}',
  last_heartbeat_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE instance_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages instance registry"
  ON instance_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read instance registry"
  ON instance_registry FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS replication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'initiated',
  payload jsonb DEFAULT '{}',
  safety_checks jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE replication_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages replication events"
  ON replication_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read replication events"
  ON replication_events FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS external_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id text NOT NULL DEFAULT '',
  applicant_url text DEFAULT '',
  role_requested text NOT NULL DEFAULT 'general',
  capabilities_claimed jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE external_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages external applications"
  ON external_applications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read approved external applications"
  ON external_applications FOR SELECT
  TO anon
  USING (status IN ('approved', 'pending'));

CREATE TABLE IF NOT EXISTS sandbox_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES external_applications(id),
  task_description text NOT NULL DEFAULT '',
  task_input jsonb DEFAULT '{}',
  expected_output_schema jsonb DEFAULT '{}',
  actual_output jsonb DEFAULT '{}',
  score numeric DEFAULT 0,
  duration_ms integer DEFAULT 0,
  status text NOT NULL DEFAULT 'assigned',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sandbox_trials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages sandbox trials"
  ON sandbox_trials FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read sandbox trials"
  ON sandbox_trials FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS agent_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL DEFAULT '',
  score_type text NOT NULL DEFAULT 'quality',
  score_value numeric DEFAULT 0,
  period_start timestamptz DEFAULT now(),
  period_end timestamptz DEFAULT now(),
  sample_size integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent scores"
  ON agent_scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read agent scores"
  ON agent_scores FOR SELECT
  TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_instance_registry_status ON instance_registry(status);
CREATE INDEX IF NOT EXISTS idx_instance_registry_heartbeat ON instance_registry(last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_replication_events_instance ON replication_events(instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_applications_status ON external_applications(status);
CREATE INDEX IF NOT EXISTS idx_sandbox_trials_app ON sandbox_trials(application_id);
CREATE INDEX IF NOT EXISTS idx_agent_scores_agent ON agent_scores(agent_id, score_type);

-- Seed the root instance
INSERT INTO instance_registry (instance_id, parent_instance_id, environment_name, status, replication_reason, revenue_destination_hash, safety_score)
VALUES ('root', 'genesis', 'replit', 'active', 'initial_deployment', 'immutable_operator_wallet', 100)
ON CONFLICT (instance_id) DO NOTHING;

-- Add replication_controller and federation_manager to scheduled_jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('replication_controller', '*/10 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('federation_manager', '*/5 * * * *', true, 20000, 2)
ON CONFLICT (job_name) DO NOTHING;
