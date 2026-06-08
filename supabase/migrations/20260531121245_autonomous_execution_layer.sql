/*
  # Autonomous Execution Layer

  1. New Tables
    - `scheduled_jobs` - Registry of all recurring jobs with cron expressions
      - `id` (uuid, primary key)
      - `job_name` (text, unique) - identifier for the job
      - `cron_expression` (text) - cron schedule
      - `enabled` (boolean) - whether the job is active
      - `max_retries` (int) - max retry attempts
      - `timeout_ms` (int) - hard execution time limit
      - `last_run_at` (timestamptz) - when it last ran
      - `next_run_at` (timestamptz) - computed next run
      - `created_at` (timestamptz)

    - `job_runs` - Durable run record for every execution
      - `id` (uuid, primary key)
      - `run_id` (text, unique) - idempotency key
      - `job_name` (text) - which job
      - `phase` (text) - orchestrator phase at time of run
      - `status` (text) - pending/running/completed/failed/retrying
      - `attempt` (int) - current attempt number
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `duration_ms` (int)
      - `error_message` (text)
      - `metrics_delta` (jsonb) - changes produced by this run
      - `promotion_decision` (text) - promote/demote/hold/rollback
      - `output_data` (jsonb) - agent output
      - `created_at` (timestamptz)

    - `orchestrator_state` - Singleton state machine
      - `id` (text, primary key) - always 'singleton'
      - `current_phase` (text) - INIT/STABILIZE/INSTRUMENT/etc
      - `phase_entered_at` (timestamptz)
      - `phase_metrics` (jsonb) - metrics at phase entry
      - `transitions_log` (jsonb[]) - history of transitions
      - `total_ticks` (int) - total orchestrator ticks
      - `last_tick_at` (timestamptz)
      - `watchdog_last_ping` (timestamptz)
      - `updated_at` (timestamptz)

    - `promotion_log` - Record of all promotion/demotion decisions
      - `id` (uuid, primary key)
      - `variant_id` (text) - what was promoted/demoted
      - `decision` (text) - promote/demote/rollback/hold
      - `reason` (text) - why
      - `baseline_rpv` (numeric)
      - `candidate_rpv` (numeric)
      - `revenue_lift_pct` (numeric)
      - `conversion_lift_pct` (numeric)
      - `settlement_integrity` (boolean)
      - `error_rate` (numeric)
      - `gating_passed` (boolean)
      - `created_at` (timestamptz)

    - `canary_routing` - Canary traffic allocation
      - `id` (uuid, primary key)
      - `target_type` (text) - variant/agent/offer/workflow
      - `target_id` (text) - reference to the target
      - `traffic_pct` (numeric) - percentage of traffic
      - `status` (text) - active/ramping/promoted/rolled_back
      - `started_at` (timestamptz)
      - `promoted_at` (timestamptz)
      - `rolled_back_at` (timestamptz)
      - `metrics` (jsonb)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Service role only access (these are system tables)

  3. Notes
    - orchestrator_state is a singleton row
    - job_runs uses run_id for idempotency
    - promotion_log provides full audit trail
*/

-- Scheduled Jobs Registry
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text UNIQUE NOT NULL,
  cron_expression text NOT NULL,
  enabled boolean DEFAULT true,
  max_retries int DEFAULT 3,
  timeout_ms int DEFAULT 30000,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages scheduled_jobs"
  ON scheduled_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Job Runs (durable execution log)
CREATE TABLE IF NOT EXISTS job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text UNIQUE NOT NULL,
  job_name text NOT NULL,
  phase text,
  status text NOT NULL DEFAULT 'pending',
  attempt int NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  error_message text,
  metrics_delta jsonb DEFAULT '{}',
  promotion_decision text,
  output_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages job_runs"
  ON job_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
CREATE INDEX IF NOT EXISTS idx_job_runs_created_at ON job_runs(created_at DESC);

-- Orchestrator State Machine (singleton)
CREATE TABLE IF NOT EXISTS orchestrator_state (
  id text PRIMARY KEY DEFAULT 'singleton',
  current_phase text NOT NULL DEFAULT 'INIT',
  phase_entered_at timestamptz DEFAULT now(),
  phase_metrics jsonb DEFAULT '{}',
  transitions_log jsonb[] DEFAULT '{}',
  total_ticks int DEFAULT 0,
  last_tick_at timestamptz,
  watchdog_last_ping timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orchestrator_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages orchestrator_state"
  ON orchestrator_state FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed singleton
INSERT INTO orchestrator_state (id, current_phase)
VALUES ('singleton', 'INIT')
ON CONFLICT (id) DO NOTHING;

-- Promotion Log
CREATE TABLE IF NOT EXISTS promotion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id text NOT NULL,
  decision text NOT NULL,
  reason text,
  baseline_rpv numeric DEFAULT 0,
  candidate_rpv numeric DEFAULT 0,
  revenue_lift_pct numeric DEFAULT 0,
  conversion_lift_pct numeric DEFAULT 0,
  settlement_integrity boolean DEFAULT true,
  error_rate numeric DEFAULT 0,
  gating_passed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE promotion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages promotion_log"
  ON promotion_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_promotion_log_variant ON promotion_log(variant_id);
CREATE INDEX IF NOT EXISTS idx_promotion_log_created ON promotion_log(created_at DESC);

-- Canary Routing
CREATE TABLE IF NOT EXISTS canary_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  traffic_pct numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  promoted_at timestamptz,
  rolled_back_at timestamptz,
  metrics jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE canary_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages canary_routing"
  ON canary_routing FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_canary_status ON canary_routing(status);

-- Seed scheduled jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, max_retries, timeout_ms) VALUES
  ('orchestrator_tick',         '*/2 * * * *',  3, 25000),
  ('agent_chain_execution',     '*/5 * * * *',  3, 45000),
  ('revenue_reconciliation',    '*/10 * * * *', 2, 20000),
  ('payout_reconciliation',     '*/15 * * * *', 2, 20000),
  ('experiment_evaluation',     '*/5 * * * *',  3, 30000),
  ('winner_promotion',          '*/10 * * * *', 2, 15000),
  ('expansion_phase_eval',      '*/30 * * * *', 2, 20000),
  ('diversification_phase_eval','0 * * * *',    2, 20000),
  ('external_intelligence_scan','0 */6 * * *',  2, 45000),
  ('health_check',              '*/3 * * * *',  3, 10000),
  ('snapshot_refresh',          '*/5 * * * *',  2, 15000),
  ('watchdog',                  '*/1 * * * *',  1, 5000)
ON CONFLICT (job_name) DO NOTHING;
