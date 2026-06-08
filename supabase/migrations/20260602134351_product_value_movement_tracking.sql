/*
  # Product-Value Movement Tracking

  1. New Table: `product_value_log`
    - Tracks per-cycle product-visible progress
    - `id` (uuid, primary key)
    - `correlation_id` (uuid) — cycle ID
    - `tick` (int) — scheduler tick number
    - `value_type` (text) — what kind of value was produced
    - `description` (text) — human-readable description
    - `evidence` (jsonb) — proof of the value change
    - `product_visible` (boolean) — whether it affects something a user/visitor can see
    - `created_at` (timestamptz)

  2. New Projection Metrics
    - `product_value_moves` — cycles that produced visible value
    - `product_neutral_cycles` — cycles that executed but added no visible value
    - `visible_improvements` — count of UI/product improvements
    - `validated_assumptions` — market/product assumptions confirmed
    - `failure_modes_reduced` — failure paths eliminated
    - `capabilities_added` — new measurable capabilities

  3. Security
    - RLS on product_value_log, service_role only

  4. Notes
    - Each cycle must classify itself: did it move value or not?
    - Progress-neutral cycles are honest, not failures
    - This drives the system toward visible product changes over internal churn
*/

CREATE TABLE IF NOT EXISTS product_value_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL,
  tick int NOT NULL DEFAULT 0,
  value_type text NOT NULL DEFAULT 'neutral',
  description text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_value_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages product value log"
  ON product_value_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_product_value_log_tick ON product_value_log (tick DESC);
CREATE INDEX IF NOT EXISTS idx_product_value_log_visible ON product_value_log (product_visible, created_at DESC);

INSERT INTO projection_metrics (metric_key, metric_value) VALUES
  ('product_value_moves', 0),
  ('product_neutral_cycles', 0),
  ('visible_improvements', 0),
  ('validated_assumptions', 0),
  ('failure_modes_reduced', 0),
  ('capabilities_added', 0)
ON CONFLICT (metric_key) DO NOTHING;
