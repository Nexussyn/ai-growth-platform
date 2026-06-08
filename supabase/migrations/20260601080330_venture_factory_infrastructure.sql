/*
  # Venture Factory Infrastructure

  1. New Tables
    - `venture_signals` - continuous market signal capture
      - `id` (uuid, primary key)
      - `source` (text) - where the signal came from
      - `topic` (text) - category of signal
      - `user_pain` (text) - the core pain point observed
      - `urgency` (text) - low, medium, high, critical
      - `target_buyer` (text) - who would pay
      - `estimated_market_size` (text) - TAM estimate
      - `willingness_to_pay` (numeric) - 0-100
      - `confidence` (numeric) - 0-100
      - `freshness` (text) - fresh, recent, stale
      - `status` (text) - captured, evaluated, converted, dismissed
      - `converted_to_idea_id` (uuid) - link to project_ideas if converted
      - `created_at` (timestamptz)

    - `venture_portfolio` - active portfolio tracking for multi-project management
      - `id` (uuid, primary key)
      - `project_idea_id` (uuid) - FK to project_ideas
      - `name` (text) - venture name
      - `status` (text) - active, paused, retired, spinout
      - `landing_url` (text)
      - `revenue_confirmed` (numeric) - total confirmed USDC
      - `conversion_rate` (numeric)
      - `funnel_views` (integer)
      - `signups` (integer)
      - `time_to_first_value_hours` (numeric)
      - `time_to_profitability_days` (numeric)
      - `best_channel` (text)
      - `variant_count` (integer) - how many variants spawned
      - `last_measured_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Modifications
    - Add `validated_at` to project_ideas for lifecycle tracking

  3. Security
    - All tables RLS enabled
    - Service role write
    - Anon read for public data
*/

CREATE TABLE IF NOT EXISTS venture_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  user_pain text NOT NULL DEFAULT '',
  urgency text NOT NULL DEFAULT 'medium',
  target_buyer text NOT NULL DEFAULT '',
  estimated_market_size text NOT NULL DEFAULT '',
  willingness_to_pay numeric DEFAULT 50,
  confidence numeric DEFAULT 50,
  freshness text NOT NULL DEFAULT 'fresh',
  status text NOT NULL DEFAULT 'captured',
  converted_to_idea_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE venture_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages venture signals"
  ON venture_signals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read venture signals"
  ON venture_signals FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS venture_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_idea_id uuid,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  landing_url text DEFAULT '',
  revenue_confirmed numeric DEFAULT 0,
  conversion_rate numeric DEFAULT 0,
  funnel_views integer DEFAULT 0,
  signups integer DEFAULT 0,
  time_to_first_value_hours numeric DEFAULT 0,
  time_to_profitability_days numeric DEFAULT 0,
  best_channel text DEFAULT '',
  variant_count integer DEFAULT 1,
  last_measured_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE venture_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages venture portfolio"
  ON venture_portfolio FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read venture portfolio"
  ON venture_portfolio FOR SELECT
  TO anon
  USING (true);

-- Add validated_at to project_ideas for lifecycle tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_ideas' AND column_name = 'validated_at'
  ) THEN
    ALTER TABLE project_ideas ADD COLUMN validated_at timestamptz;
  END IF;
END $$;

-- Add revenue_model to project_ideas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_ideas' AND column_name = 'revenue_model'
  ) THEN
    ALTER TABLE project_ideas ADD COLUMN revenue_model text DEFAULT 'pay-per-use';
  END IF;
END $$;

-- Add distribution_channels to project_ideas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_ideas' AND column_name = 'distribution_channels'
  ) THEN
    ALTER TABLE project_ideas ADD COLUMN distribution_channels text[] DEFAULT '{}';
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venture_signals_status ON venture_signals(status, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_venture_signals_topic ON venture_signals(topic, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venture_portfolio_status ON venture_portfolio(status, revenue_confirmed DESC);

-- Register scheduled jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('venture_signal_scanner', '*/10 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('venture_launcher', '*/15 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('venture_portfolio_manager', '*/20 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;
