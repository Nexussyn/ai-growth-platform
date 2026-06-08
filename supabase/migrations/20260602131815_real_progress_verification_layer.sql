/*
  # Real Progress Verification Layer

  1. New Table: `verification_receipts`
    - Stores cryptographic proof of real external actions
    - `id` (uuid, primary key)
    - `correlation_id` (uuid) — ties to the cycle
    - `layer` (text) — 'action', 'persistence', 'projection', 'benchmark'
    - `domain` (text) — which external domain was contacted
    - `endpoint` (text) — URL path
    - `http_status` (int) — real HTTP status received
    - `response_hash` (text) — SHA-256 of response body proving real data
    - `response_length` (int) — byte length of response
    - `latency_ms` (int) — how long the call took
    - `verified_real` (boolean) — whether this passes realness checks
    - `created_at` (timestamptz)

  2. New Projection Metrics
    - `verification_actions_confirmed` — actions with real HTTP response
    - `verification_persistence_confirmed` — events found in DB after action
    - `verification_projection_confirmed` — projections updated after persistence
    - `verification_benchmark_confirmed` — benchmarks with real outbound evidence
    - `simulation_suspected_count` — times simulation was detected
    - `projection_drift_count` — projection didn't update after real action
    - `benchmark_phantom_count` — benchmark logged without outbound proof
    - `verification_passes` — full verification passes (all layers real)
    - `verification_failures` — at least one layer failed verification

  3. Security
    - RLS on verification_receipts, service_role only

  4. Notes
    - response_hash proves we got real data, not a fabricated log
    - Cross-layer correlation ensures action → persistence → projection chain
    - Mismatch detection enables auto-degradation of phantom subsystems
*/

CREATE TABLE IF NOT EXISTS verification_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL,
  layer text NOT NULL DEFAULT 'action',
  domain text NOT NULL DEFAULT '',
  endpoint text NOT NULL DEFAULT '',
  http_status int,
  response_hash text NOT NULL DEFAULT '',
  response_length int NOT NULL DEFAULT 0,
  latency_ms int NOT NULL DEFAULT 0,
  verified_real boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE verification_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages verification receipts"
  ON verification_receipts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_verification_receipts_cid ON verification_receipts (correlation_id);
CREATE INDEX IF NOT EXISTS idx_verification_receipts_created ON verification_receipts (created_at DESC);

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('verification_actions_confirmed', 0),
  ('verification_persistence_confirmed', 0),
  ('verification_projection_confirmed', 0),
  ('verification_benchmark_confirmed', 0),
  ('simulation_suspected_count', 0),
  ('projection_drift_count', 0),
  ('benchmark_phantom_count', 0),
  ('verification_passes', 0),
  ('verification_failures', 0)
ON CONFLICT (metric_key) DO NOTHING;
