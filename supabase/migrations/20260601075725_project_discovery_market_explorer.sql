/*
  # Project Discovery Engine & Market Explorer

  1. New Tables
    - `project_ideas` - continuous stream of profitable project ideas
      - `id` (uuid, primary key)
      - `title` (text) - idea name
      - `problem` (text) - what problem it solves
      - `target_user` (text) - who would pay
      - `estimated_revenue` (numeric) - monthly $ estimate
      - `difficulty` (text) - easy, medium, hard
      - `time_to_launch` (text) - 1d, 1w, 1m
      - `margin_score` (numeric) - 0-100
      - `confidence_score` (numeric) - 0-100
      - `market_size_score` (numeric) - 0-100
      - `speed_score` (numeric) - 0-100
      - `composite_score` (numeric) - weighted average
      - `status` (text) - proposed, sandboxing, launched, iterating, profitable, retired
      - `category` (text) - vertical SaaS, agent economy, automation, etc.
      - `landing_url` (text) - public landing page if launched
      - `manifest_url` (text) - agent manifest if relevant
      - `payment_route` (text) - payment path
      - `metrics` (jsonb) - funnel data, traction signals
      - `launched_at` (timestamptz)
      - `retired_at` (timestamptz)
      - `created_at` (timestamptz)

    - `market_opportunities` - broader market signals and opportunities
      - `id` (uuid, primary key)
      - `category` (text) - product, seo, content, integration, channel, white_label, agent_monetization
      - `title` (text)
      - `description` (text)
      - `pain_point` (text) - the core problem
      - `monetization_plan` (text)
      - `measurement_plan` (text)
      - `score` (numeric) - 0-100
      - `status` (text) - discovered, evaluated, actioned, retired
      - `created_at` (timestamptz)

    - `agent_productivity` - per-agent productivity tracking
      - `id` (uuid, primary key)
      - `agent_id` (text)
      - `period` (text) - hourly, daily
      - `tasks_completed` (integer)
      - `tasks_failed` (integer)
      - `throughput` (numeric) - tasks per hour
      - `revenue_attributed` (numeric) - USDC
      - `cost_per_output` (numeric)
      - `time_idle_seconds` (integer)
      - `success_rate` (numeric) - 0-100
      - `period_start` (timestamptz)
      - `period_end` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - All tables RLS enabled
    - Service role write
    - Anon read for published content
*/

CREATE TABLE IF NOT EXISTS project_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  problem text NOT NULL DEFAULT '',
  target_user text NOT NULL DEFAULT '',
  estimated_revenue numeric DEFAULT 0,
  difficulty text NOT NULL DEFAULT 'medium',
  time_to_launch text NOT NULL DEFAULT '1w',
  margin_score numeric DEFAULT 50,
  confidence_score numeric DEFAULT 50,
  market_size_score numeric DEFAULT 50,
  speed_score numeric DEFAULT 50,
  composite_score numeric DEFAULT 50,
  status text NOT NULL DEFAULT 'proposed',
  category text NOT NULL DEFAULT 'automation',
  landing_url text DEFAULT '',
  manifest_url text DEFAULT '',
  payment_route text DEFAULT '',
  metrics jsonb DEFAULT '{}',
  launched_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages project ideas"
  ON project_ideas FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read launched project ideas"
  ON project_ideas FOR SELECT
  TO anon
  USING (status IN ('launched', 'iterating', 'profitable'));

CREATE TABLE IF NOT EXISTS market_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'product',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  pain_point text NOT NULL DEFAULT '',
  monetization_plan text NOT NULL DEFAULT '',
  measurement_plan text NOT NULL DEFAULT '',
  score numeric DEFAULT 50,
  status text NOT NULL DEFAULT 'discovered',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE market_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages market opportunities"
  ON market_opportunities FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read market opportunities"
  ON market_opportunities FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS agent_productivity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL DEFAULT '',
  period text NOT NULL DEFAULT 'hourly',
  tasks_completed integer DEFAULT 0,
  tasks_failed integer DEFAULT 0,
  throughput numeric DEFAULT 0,
  revenue_attributed numeric DEFAULT 0,
  cost_per_output numeric DEFAULT 0,
  time_idle_seconds integer DEFAULT 0,
  success_rate numeric DEFAULT 0,
  period_start timestamptz DEFAULT now(),
  period_end timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_productivity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent productivity"
  ON agent_productivity FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read agent productivity"
  ON agent_productivity FOR SELECT
  TO anon
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_ideas_status ON project_ideas(status, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_project_ideas_score ON project_ideas(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_market_opportunities_status ON market_opportunities(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_productivity_agent ON agent_productivity(agent_id, period_start DESC);

-- Register new scheduled jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('project_discovery_engine', '*/10 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('market_explorer', '*/30 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('agent_expansion_engine', '*/5 * * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('productivity_tracker', '*/15 * * * *', true, 20000, 2)
ON CONFLICT (job_name) DO NOTHING;
