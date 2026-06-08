/*
  # Opportunistic Revenue Discovery Infrastructure

  1. New Tables
    - `revenue_opportunities`
      - `id` (uuid, primary key)
      - `source_type` (text) — affiliate, lead_gen, api_billing, workflow_fees, paid_alerts, data_enrichment, b2b_services, licensing, usage_pricing, performance_pricing, partnerships
      - `title` (text) — short description
      - `value_hypothesis` (text) — what we think will generate revenue
      - `target_user` (text) — who would pay
      - `time_to_validate_hours` (int) — estimated hours to validate
      - `implementation_cost` (text) — low/medium/high
      - `risk_level` (text) — low/medium/high
      - `expected_margin_pct` (int) — expected profit margin
      - `dependency_footprint` (text) — what external services needed
      - `automation_potential` (text) — low/medium/high/full
      - `score` (int) — composite opportunity score 0-100
      - `status` (text) — discovered/testing/validated/rejected/active
      - `evidence` (jsonb) — validation results and proof
      - `discovered_at` (timestamptz)
      - `validated_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

    - `revenue_routes`
      - `id` (uuid, primary key)
      - `opportunity_id` (uuid, FK) — which opportunity this implements
      - `route_name` (text) — human-readable name
      - `collection_method` (text) — how revenue is collected
      - `status` (text) — pending_validation/active/paused/retired
      - `total_revenue_cents` (bigint) — accumulated revenue
      - `conversion_signals` (int) — measurable conversion events
      - `last_signal_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

  2. New Projection Metrics
    - `opportunities_discovered` — total found
    - `opportunities_testing` — currently being validated
    - `opportunities_validated` — passed validation
    - `opportunities_rejected` — failed validation
    - `revenue_routes_active` — routes currently collecting
    - `opportunistic_cycles_run` — discovery loop iterations

  3. Security
    - RLS on both tables, service_role only

  4. Notes
    - Opportunities are scored compositely for automated prioritization
    - Revenue routes are only created after validation passes
    - Monetization remains locked until a route produces real conversion signals
*/

CREATE TABLE IF NOT EXISTS revenue_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL DEFAULT 'unknown',
  title text NOT NULL DEFAULT '',
  value_hypothesis text NOT NULL DEFAULT '',
  target_user text NOT NULL DEFAULT '',
  time_to_validate_hours int NOT NULL DEFAULT 24,
  implementation_cost text NOT NULL DEFAULT 'medium',
  risk_level text NOT NULL DEFAULT 'medium',
  expected_margin_pct int NOT NULL DEFAULT 50,
  dependency_footprint text NOT NULL DEFAULT 'none',
  automation_potential text NOT NULL DEFAULT 'medium',
  score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'discovered',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revenue_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages revenue opportunities"
  ON revenue_opportunities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_score ON revenue_opportunities (score DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_status ON revenue_opportunities (status, score DESC);

CREATE TABLE IF NOT EXISTS revenue_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES revenue_opportunities(id),
  route_name text NOT NULL DEFAULT '',
  collection_method text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_validation',
  total_revenue_cents bigint NOT NULL DEFAULT 0,
  conversion_signals int NOT NULL DEFAULT 0,
  last_signal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revenue_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages revenue routes"
  ON revenue_routes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_revenue_routes_status ON revenue_routes (status);

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('opportunities_discovered', 0),
  ('opportunities_testing', 0),
  ('opportunities_validated', 0),
  ('opportunities_rejected', 0),
  ('revenue_routes_active', 0),
  ('opportunistic_cycles_run', 0)
ON CONFLICT (metric_key) DO NOTHING;
