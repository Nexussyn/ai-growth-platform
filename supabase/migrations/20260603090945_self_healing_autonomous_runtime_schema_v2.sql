/*
  # 24/7 Self-Healing Autonomous Runtime Schema

  1. New Tables
    - `runtime_agent_health` — per-agent health scoreboard
      - role (text pk), last_probe_ok (boolean), last_probe_at, consecutive_failures (int), p50_latency_ms, p99_latency_ms, total_probes, ok_probes
      - last_error (text), severity (low/medium/high/critical)

    - `runtime_anomalies` — detected anomalies for self-healing
      - id (uuid pk), task_id, anomaly_type (no_op_cycles/preview_unchanged/repeated_error/malformed_data/code_ui_divergence/rollback_failure)
      - severity, evidence (jsonb), correlated_task_id, status (open/correcting/resolved/escalated)
      - detected_at, resolved_at

    - `runtime_healing_actions` — actions taken by the self-healer
      - id (uuid pk), anomaly_id, action_type (auto_correct/rollback/escalate_dlq/diversify_source/pause_routing/no_op)
      - smallest_reversible (boolean), evidence_bundle_id (nullable)
      - rollback_point_id (text), reverify_status (pending/passed/failed)
      - created_at, completed_at

    - `runtime_cycles` — detect no-op cycle threshold
      - id (uuid pk), cycle_no (int), made_progress (boolean), notes (text), created_at

  2. Modified Table: `runtime_jobs` already has all required fields from prior migration

  3. New Projection Metrics
    - healing_loop_runs, anomalies_detected, anomalies_resolved, anomalies_escalated
    - auto_corrections_applied, healing_rollbacks_triggered, source_diversifications
    - probes_run, probes_failed
    - no_op_cycles, wiring_failures_classified

  4. Security
    - RLS on all new tables, service_role only

  5. Notes
    - Self-healer reads recent audit log + anomalies and applies smallest reversible change
    - Cron drives the loop every minute; broker/observability collaborate
    - All healing actions are evidence-backed and reversible
*/

CREATE TABLE IF NOT EXISTS runtime_agent_health (
  role text PRIMARY KEY,
  last_probe_ok boolean NOT NULL DEFAULT true,
  last_probe_at timestamptz NOT NULL DEFAULT now(),
  consecutive_failures int NOT NULL DEFAULT 0,
  p50_latency_ms int NOT NULL DEFAULT 0,
  p99_latency_ms int NOT NULL DEFAULT 0,
  total_probes int NOT NULL DEFAULT 0,
  ok_probes int NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'low'
);

ALTER TABLE runtime_agent_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages agent health" ON runtime_agent_health FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL DEFAULT '',
  anomaly_type text NOT NULL DEFAULT 'unknown',
  severity text NOT NULL DEFAULT 'medium',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlated_task_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE runtime_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages anomalies" ON runtime_anomalies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_runtime_anomalies_status ON runtime_anomalies (status, detected_at DESC);

CREATE TABLE IF NOT EXISTS runtime_healing_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id uuid,
  action_type text NOT NULL DEFAULT 'no_op',
  smallest_reversible boolean NOT NULL DEFAULT true,
  evidence_bundle_id uuid,
  rollback_point_id text NOT NULL DEFAULT '',
  reverify_status text NOT NULL DEFAULT 'pending',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE runtime_healing_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages healing actions" ON runtime_healing_actions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS runtime_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_no int NOT NULL DEFAULT 0,
  made_progress boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages cycles" ON runtime_cycles FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('healing_loop_runs', 0),
  ('anomalies_detected', 0),
  ('anomalies_resolved', 0),
  ('anomalies_escalated', 0),
  ('auto_corrections_applied', 0),
  ('healing_rollbacks_triggered', 0),
  ('source_diversifications', 0),
  ('probes_run', 0),
  ('probes_failed', 0),
  ('no_op_cycles', 0),
  ('wiring_failures_classified', 0)
ON CONFLICT (metric_key) DO NOTHING;

-- Seed agent_health rows for all 15 agents
INSERT INTO runtime_agent_health (role) SELECT role FROM runtime_agents
ON CONFLICT (role) DO NOTHING;
