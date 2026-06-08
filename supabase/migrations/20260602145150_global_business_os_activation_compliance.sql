/*
  # Global Business Operating System — Activation Compliance Gates

  1. Modified Table: `revenue_routes`
    - Add columns for activation compliance:
      - `compliance_check_passed` (boolean) — whether the route passed legal/compliance review
      - `compliance_notes` (text) — notes from compliance check
      - `fallback_behavior` (text) — what happens if route fails (pause/retry/archive)
      - `destination_configured` (boolean) — whether collection endpoint is set up
      - `demand_evidence` (jsonb) — proof of real demand
      - `underperformance_threshold` (int) — signals below this in 24h triggers replacement
      - `activated_at` (timestamptz, nullable)
      - `replaced_at` (timestamptz, nullable)
      - `replacement_reason` (text)

  2. New Projection Metrics
    - `routes_compliance_passed` — routes that passed compliance
    - `routes_replaced` — routes replaced due to underperformance
    - `activation_attempts` — total attempts to activate routes
    - `activation_blocked_no_evidence` — blocked activations (no demand evidence)

  3. Security
    - Existing RLS on revenue_routes (service_role only) applies

  4. Notes
    - Routes require 6 checks before activation: evidence, signal, trace, destination, fallback, compliance
    - Underperforming routes get replaced automatically
    - All activation attempts are logged regardless of outcome
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'compliance_check_passed') THEN
    ALTER TABLE revenue_routes ADD COLUMN compliance_check_passed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'compliance_notes') THEN
    ALTER TABLE revenue_routes ADD COLUMN compliance_notes text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'fallback_behavior') THEN
    ALTER TABLE revenue_routes ADD COLUMN fallback_behavior text NOT NULL DEFAULT 'pause';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'destination_configured') THEN
    ALTER TABLE revenue_routes ADD COLUMN destination_configured boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'demand_evidence') THEN
    ALTER TABLE revenue_routes ADD COLUMN demand_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'underperformance_threshold') THEN
    ALTER TABLE revenue_routes ADD COLUMN underperformance_threshold int NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'activated_at') THEN
    ALTER TABLE revenue_routes ADD COLUMN activated_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'replaced_at') THEN
    ALTER TABLE revenue_routes ADD COLUMN replaced_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_routes' AND column_name = 'replacement_reason') THEN
    ALTER TABLE revenue_routes ADD COLUMN replacement_reason text NOT NULL DEFAULT '';
  END IF;
END $$;

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('routes_compliance_passed', 0),
  ('routes_replaced', 0),
  ('activation_attempts', 0),
  ('activation_blocked_no_evidence', 0)
ON CONFLICT (metric_key) DO NOTHING;
