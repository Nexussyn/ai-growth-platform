/*
  # Aggressive Global Profit Hunt Infrastructure

  1. Modified Table: `revenue_opportunities`
    - Add columns for expanded scoring dimensions:
      - `conversion_probability` (int 0-100)
      - `capital_intensity` (text: none/low/medium/high)
      - `resilience` (text: fragile/moderate/resilient/antifragile)
      - `strategic_optionality` (text: low/medium/high)
      - `comparison_vs_product` (text: worse/equal/better/much_better)
      - `pivot_priority` (int 0-100, composite aggressive score)
      - `last_scored_at` (timestamptz)
      - `archived_at` (timestamptz, nullable)

  2. New Table: `profit_hunt_log`
    - `id` (uuid, primary key)
    - `tick` (int) — which cycle triggered this
    - `action` (text) — discover/score/validate/pivot/archive/activate
    - `opportunity_id` (uuid, nullable)
    - `reason` (text) — why this action was taken
    - `scoring_snapshot` (jsonb) — full scoring at decision time
    - `created_at` (timestamptz)

  3. New Projection Metrics
    - `profit_hunt_cycles` — total aggressive hunt iterations
    - `pivots_executed` — times priority was reallocated
    - `opportunities_archived` — weak paths removed
    - `opportunities_compared_to_product` — comparison evaluations
    - `best_opportunity_score` — highest current score in queue

  4. Security
    - RLS on profit_hunt_log, service_role only

  5. Notes
    - pivot_priority is the aggressive composite score that ranks ALL opportunities globally
    - comparison_vs_product tracks whether each opportunity beats the core product
    - Pivoting means reallocating attention/validation resources to a higher-scored opportunity
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'conversion_probability') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN conversion_probability int NOT NULL DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'capital_intensity') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN capital_intensity text NOT NULL DEFAULT 'low';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'resilience') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN resilience text NOT NULL DEFAULT 'moderate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'strategic_optionality') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN strategic_optionality text NOT NULL DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'comparison_vs_product') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN comparison_vs_product text NOT NULL DEFAULT 'equal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'pivot_priority') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN pivot_priority int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'last_scored_at') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN last_scored_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_opportunities' AND column_name = 'archived_at') THEN
    ALTER TABLE revenue_opportunities ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS profit_hunt_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tick int NOT NULL DEFAULT 0,
  action text NOT NULL DEFAULT 'discover',
  opportunity_id uuid,
  reason text NOT NULL DEFAULT '',
  scoring_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profit_hunt_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages profit hunt log"
  ON profit_hunt_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_profit_hunt_log_tick ON profit_hunt_log (tick DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_pivot ON revenue_opportunities (pivot_priority DESC) WHERE archived_at IS NULL;

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('profit_hunt_cycles', 0),
  ('pivots_executed', 0),
  ('opportunities_archived', 0),
  ('opportunities_compared_to_product', 0),
  ('best_opportunity_score', 0)
ON CONFLICT (metric_key) DO NOTHING;
