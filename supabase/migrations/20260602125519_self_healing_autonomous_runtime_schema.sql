/*
  # Self-Healing Autonomous Runtime — Persistence Layer

  1. New Projection Metrics
    - `subsystems_degraded` — count of currently degraded subsystems
    - `auto_recoveries` — total successful auto-recoveries
    - `fallback_activations` — times fallback behavior activated
    - `transient_failures_healed` — transient errors recovered without intervention
    - `capability_degradations` — capabilities marked degraded
    - `capability_restorations` — capabilities restored after healing
    - `state_resumptions` — times runtime resumed from persisted state
    - `self_healing_cycles` — cycles where self-healing logic triggered

  2. New Table: `subsystem_health`
    - Tracks health state of each subsystem (discovery, outreach, execution, benchmark, telegram, db)
    - `name` (text, primary key) — subsystem identifier
    - `status` (text) — 'healthy', 'degraded', 'isolated'
    - `consecutive_failures` (int) — failure count since last success
    - `last_success_at` (timestamptz)
    - `last_failure_at` (timestamptz)
    - `degraded_at` (timestamptz, nullable)
    - `failure_reason` (text)
    - `auto_recover_after` (timestamptz, nullable) — when to attempt re-enabling

  3. Security
    - RLS on subsystem_health, service_role only

  4. Notes
    - Self-healing means: degrade, route around, retry later, restore on success
    - No manual restart needed for transient infrastructure failures
    - State resumption on cold start from projection_metrics + subsystem_health
*/

CREATE TABLE IF NOT EXISTS subsystem_health (
  name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'healthy',
  consecutive_failures int NOT NULL DEFAULT 0,
  last_success_at timestamptz DEFAULT now(),
  last_failure_at timestamptz,
  degraded_at timestamptz,
  failure_reason text NOT NULL DEFAULT '',
  auto_recover_after timestamptz
);

ALTER TABLE subsystem_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages subsystem health"
  ON subsystem_health
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO subsystem_health (name, status) VALUES
  ('discovery', 'healthy'),
  ('outreach', 'healthy'),
  ('execution', 'healthy'),
  ('benchmark', 'healthy'),
  ('telegram', 'healthy'),
  ('db', 'healthy')
ON CONFLICT (name) DO NOTHING;

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('subsystems_degraded', 0),
  ('auto_recoveries', 0),
  ('fallback_activations', 0),
  ('transient_failures_healed', 0),
  ('capability_degradations', 0),
  ('capability_restorations', 0),
  ('state_resumptions', 0),
  ('self_healing_cycles', 0)
ON CONFLICT (metric_key) DO NOTHING;
