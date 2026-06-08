/*
  # Autonomous Venture Factory - Final Schema

  1. New Tables
    - `governance_events` - audit trail for sensitive actions
      - Tracks wallet change attempts, secret access, permission modifications
      - Every sensitive action is logged and verified
    - `system_events` - verified runtime events backing all public claims
      - Every UI badge, metric, and status must trace to a system_event
    - `revenue_ledger` - payment-to-net reconciliation
      - Links payments to gross/fees/net breakdown
      - Verifies destination wallet on every settlement

  2. Column additions
    - `agent_tasks.result` (jsonb) - task output
    - `agent_tasks.updated_at` (timestamptz)
    - `agent_registry.source` (text) - where agent was discovered
    - `agent_registry.trust_score` (numeric)
    - `agent_registry.productivity_score` (numeric)
    - `agent_registry.reliability_score` (numeric)
    - `agent_registry.output_quality_score` (numeric)
    - `agent_registry.current_assignment` (text)
    - `agent_registry.capability_tags` (text[])
    - `project_ideas.solution` (text)
    - `project_ideas.acquisition_channel` (text)
    - `project_ideas.feasibility_score` (numeric)
    - `project_ideas.owner_agent_id` (text)
    - `project_ideas.source_signal_id` (uuid)
    - `project_ideas.evidence_url` (text)

  3. Scheduled jobs
    - `job_verify_reality` - reality checker
    - `job_self_heal` - self-healing ops
    - `job_governance_audit` - governance enforcement

  4. Security
    - All tables RLS enabled
    - Service role manages data
    - Anon reads public-safe data only
*/

-- governance_events
CREATE TABLE IF NOT EXISTS governance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'logged',
  reason text NOT NULL DEFAULT '',
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE governance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages governance events"
  ON governance_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read governance events"
  ON governance_events FOR SELECT
  TO anon
  USING (true);

-- system_events (verified runtime events)
CREATE TABLE IF NOT EXISTS system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'info',
  payload jsonb DEFAULT '{}',
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages system events"
  ON system_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read verified system events"
  ON system_events FOR SELECT
  TO anon
  USING (verified = true);

-- revenue_ledger
CREATE TABLE IF NOT EXISTS revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid,
  venture_id uuid,
  gross_amount numeric DEFAULT 0,
  fees_amount numeric DEFAULT 0,
  net_amount numeric DEFAULT 0,
  destination_wallet text NOT NULL DEFAULT 'OPERATOR_WALLET_ADDRESS',
  reconciliation_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE revenue_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages revenue ledger"
  ON revenue_ledger FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read reconciled revenue"
  ON revenue_ledger FOR SELECT
  TO anon
  USING (reconciliation_status = 'confirmed');

-- Add columns to agent_tasks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_tasks' AND column_name='result') THEN
    ALTER TABLE agent_tasks ADD COLUMN result jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_tasks' AND column_name='updated_at') THEN
    ALTER TABLE agent_tasks ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Add columns to agent_registry
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_registry' AND column_name='source') THEN
    ALTER TABLE agent_registry ADD COLUMN source text DEFAULT 'internal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_registry' AND column_name='trust_score') THEN
    ALTER TABLE agent_registry ADD COLUMN trust_score numeric DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_registry' AND column_name='productivity_score') THEN
    ALTER TABLE agent_registry ADD COLUMN productivity_score numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_registry' AND column_name='reliability_score') THEN
    ALTER TABLE agent_registry ADD COLUMN reliability_score numeric DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_registry' AND column_name='output_quality_score') THEN
    ALTER TABLE agent_registry ADD COLUMN output_quality_score numeric DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_registry' AND column_name='current_assignment') THEN
    ALTER TABLE agent_registry ADD COLUMN current_assignment text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_registry' AND column_name='capability_tags') THEN
    ALTER TABLE agent_registry ADD COLUMN capability_tags text[] DEFAULT '{}';
  END IF;
END $$;

-- Add columns to project_ideas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_ideas' AND column_name='solution') THEN
    ALTER TABLE project_ideas ADD COLUMN solution text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_ideas' AND column_name='acquisition_channel') THEN
    ALTER TABLE project_ideas ADD COLUMN acquisition_channel text DEFAULT 'organic';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_ideas' AND column_name='feasibility_score') THEN
    ALTER TABLE project_ideas ADD COLUMN feasibility_score numeric DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_ideas' AND column_name='owner_agent_id') THEN
    ALTER TABLE project_ideas ADD COLUMN owner_agent_id text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_ideas' AND column_name='source_signal_id') THEN
    ALTER TABLE project_ideas ADD COLUMN source_signal_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_ideas' AND column_name='evidence_url') THEN
    ALTER TABLE project_ideas ADD COLUMN evidence_url text DEFAULT '';
  END IF;
END $$;

-- Add freshness_score to venture_signals if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_signals' AND column_name='freshness_score') THEN
    ALTER TABLE venture_signals ADD COLUMN freshness_score numeric DEFAULT 80;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venture_signals' AND column_name='demand_score') THEN
    ALTER TABLE venture_signals ADD COLUMN demand_score numeric DEFAULT 50;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_governance_events_action ON governance_events(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_entity ON system_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_status ON revenue_ledger(reconciliation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_venture ON revenue_ledger(venture_id);

-- Register new scheduled jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('job_verify_reality', '*/5 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('job_self_heal', '*/5 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('job_governance_audit', '*/10 * * * *', true, 20000, 2)
ON CONFLICT (job_name) DO NOTHING;
