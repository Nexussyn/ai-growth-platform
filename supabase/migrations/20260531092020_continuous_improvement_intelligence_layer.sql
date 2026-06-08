/*
  # Continuous Improvement & External Intelligence Layer

  1. New Tables
    - `improvement_proposals` — Every improvement hypothesis, scored and tracked
      - `id` (uuid, primary key)
      - `proposal_id` (text, unique) — human-readable identifier
      - `source` (text) — internal_data, external_signal, agent_suggestion, pattern_match
      - `source_agent` (text) — which agent generated this
      - `category` (text) — revenue, visibility, stability, capability, distribution
      - `title` (text) — short description
      - `rationale` (text) — why this was proposed
      - `expected_impact` (jsonb) — { revenue_lift_pct, conversion_lift_pct, stability_score }
      - `confidence` (numeric) — 0 to 1
      - `risk` (text) — low, medium, high
      - `implementation_cost` (text) — trivial, low, medium, high
      - `compatibility_score` (numeric) — 0 to 1, how well it fits current stack
      - `testability` (text) — ab_test, canary, direct_deploy, manual_review
      - `status` (text) — proposed, approved, testing, promoted, rejected, archived, rolled_back
      - `experiment_id` (uuid, nullable) — linked experiment_variants row
      - `result_data` (jsonb) — outcome after testing
      - `decision` (text) — promote, reject, extend_test, rollback
      - `decided_at` (timestamptz)
      - `created_at` (timestamptz)

    - `improvement_memory` — Versioned memory of what worked and what failed
      - `id` (uuid, primary key)
      - `memory_type` (text) — winning_prompt, winning_chain, winning_channel, winning_offer, winning_cta, winning_fix, failed_approach, strategy_version
      - `category` (text) — revenue, marketing, stability, growth, settlement, ui
      - `title` (text)
      - `content` (jsonb) — the actual data/config/approach
      - `outcome` (jsonb) — measured results
      - `version` (integer, default 1)
      - `is_active` (boolean, default true)
      - `superseded_by` (uuid, nullable) — points to newer version
      - `created_at` (timestamptz)

    - `update_intelligence` — External signal tracking
      - `id` (uuid, primary key)
      - `signal_type` (text) — ai_model_release, framework_update, growth_tactic, infra_update, payment_pattern, ui_pattern
      - `source_url` (text) — where this was found
      - `summary` (text) — structured summary
      - `relevance_score` (numeric) — 0 to 1
      - `mapped_to` (text) — which part of current architecture it maps to
      - `proposed_changes` (jsonb) — structured change proposal
      - `estimated_impact` (jsonb) — { revenue_lift, stability_gain, effort }
      - `status` (text) — discovered, evaluated, proposed, implemented, rejected
      - `proposal_id` (text, nullable) — links to improvement_proposals
      - `created_at` (timestamptz)

    - `improvement_roadmap` — Ranked backlog of next-best extensions
      - `id` (uuid, primary key)
      - `title` (text)
      - `description` (text)
      - `category` (text) — monetization, segment, content, channel, automation, agent_role, dashboard, safeguard
      - `expected_value_score` (numeric) — composite ranking score
      - `experiment_spec` (jsonb) — what to test
      - `data_model_diff` (jsonb) — schema changes needed
      - `ui_diff` (jsonb) — frontend changes needed
      - `agent_diff` (jsonb) — agent changes needed
      - `rollback_plan` (jsonb) — how to undo
      - `status` (text) — backlog, in_progress, completed, cancelled
      - `priority` (integer, default 50)
      - `created_at` (timestamptz)

    - `improvement_cycles` — Track each improvement engine run
      - `id` (uuid, primary key)
      - `cycle_number` (integer)
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz, nullable)
      - `status` (text) — running, completed, failed
      - `performance_snapshot` (jsonb) — metrics at start
      - `proposals_generated` (integer, default 0)
      - `experiments_started` (integer, default 0)
      - `promotions` (integer, default 0)
      - `rejections` (integer, default 0)
      - `summary` (jsonb) — overall result

  2. Security
    - RLS enabled on all tables
    - Anon SELECT for dashboard visibility
    - Service role for all mutations

  3. Indexes
    - improvement_proposals: status, category
    - improvement_memory: memory_type, is_active
    - update_intelligence: status, relevance_score
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- IMPROVEMENT PROPOSALS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS improvement_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id text UNIQUE NOT NULL,
  source text NOT NULL DEFAULT 'internal_data',
  source_agent text NOT NULL DEFAULT 'supervisor',
  category text NOT NULL DEFAULT 'revenue',
  title text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  expected_impact jsonb NOT NULL DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0.5,
  risk text NOT NULL DEFAULT 'low',
  implementation_cost text NOT NULL DEFAULT 'low',
  compatibility_score numeric NOT NULL DEFAULT 0.8,
  testability text NOT NULL DEFAULT 'ab_test',
  status text NOT NULL DEFAULT 'proposed',
  experiment_id uuid REFERENCES experiment_variants(id),
  result_data jsonb NOT NULL DEFAULT '{}',
  decision text,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE improvement_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read improvement_proposals"
  ON improvement_proposals FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages improvement_proposals"
  ON improvement_proposals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_improvement_proposals_status ON improvement_proposals(status);
CREATE INDEX IF NOT EXISTS idx_improvement_proposals_category ON improvement_proposals(category);

-- ═══════════════════════════════════════════════════════════════════════════════
-- IMPROVEMENT MEMORY
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS improvement_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type text NOT NULL,
  category text NOT NULL DEFAULT 'revenue',
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  outcome jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES improvement_memory(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE improvement_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read improvement_memory"
  ON improvement_memory FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages improvement_memory"
  ON improvement_memory FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_improvement_memory_type_active ON improvement_memory(memory_type, is_active);

-- ═══════════════════════════════════════════════════════════════════════════════
-- UPDATE INTELLIGENCE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS update_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL,
  source_url text NOT NULL DEFAULT '',
  summary text NOT NULL,
  relevance_score numeric NOT NULL DEFAULT 0.5,
  mapped_to text NOT NULL DEFAULT '',
  proposed_changes jsonb NOT NULL DEFAULT '{}',
  estimated_impact jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'discovered',
  proposal_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE update_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read update_intelligence"
  ON update_intelligence FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages update_intelligence"
  ON update_intelligence FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_update_intelligence_status ON update_intelligence(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- IMPROVEMENT ROADMAP
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS improvement_roadmap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'monetization',
  expected_value_score numeric NOT NULL DEFAULT 0,
  experiment_spec jsonb NOT NULL DEFAULT '{}',
  data_model_diff jsonb NOT NULL DEFAULT '{}',
  ui_diff jsonb NOT NULL DEFAULT '{}',
  agent_diff jsonb NOT NULL DEFAULT '{}',
  rollback_plan jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'backlog',
  priority integer NOT NULL DEFAULT 50,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE improvement_roadmap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read improvement_roadmap"
  ON improvement_roadmap FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages improvement_roadmap"
  ON improvement_roadmap FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- IMPROVEMENT CYCLES
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS improvement_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_number integer NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  performance_snapshot jsonb NOT NULL DEFAULT '{}',
  proposals_generated integer NOT NULL DEFAULT 0,
  experiments_started integer NOT NULL DEFAULT 0,
  promotions integer NOT NULL DEFAULT 0,
  rejections integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE improvement_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read improvement_cycles"
  ON improvement_cycles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages improvement_cycles"
  ON improvement_cycles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED: Initial intelligence signals and memory entries
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO improvement_memory (memory_type, category, title, content, outcome) VALUES
  ('strategy_version', 'revenue', 'Initial x402 payment strategy', '{"version": 1, "approach": "single_price_0.03_usdc", "network": "base", "protocol": "x402"}', '{"status": "active", "note": "baseline strategy"}'),
  ('winning_fix', 'stability', 'Persistent DB counters prevent reset on cold start', '{"fix": "system_metrics singleton row", "prevents": "counter_reset_on_deploy"}', '{"stability_gain": "high", "deployed": true}'),
  ('winning_fix', 'stability', 'usePolled keeps stale data on fetch error', '{"fix": "never_clear_data_on_error", "pattern": "stale_while_revalidate"}', '{"ux_improvement": "no_blank_screens"}'),
  ('failed_approach', 'revenue', 'Simulated payments - zero real revenue', '{"approach": "X-Payment header simulation", "problem": "no_actual_usdc_transfer"}', '{"revenue": 0, "lesson": "must_use_real_x402_protocol"}')
ON CONFLICT DO NOTHING;

INSERT INTO update_intelligence (signal_type, summary, relevance_score, mapped_to, status) VALUES
  ('ai_model_release', 'Claude 4.6 Opus available with improved reasoning for agent orchestration', 0.8, 'agent_orchestration', 'discovered'),
  ('growth_tactic', 'x402 protocol gaining adoption - more AI agents support native HTTP 402 payments', 0.9, 'payment_discovery', 'discovered'),
  ('framework_update', 'Supabase Edge Functions now support longer execution times for complex agent chains', 0.7, 'edge_function', 'discovered'),
  ('payment_pattern', 'Multi-tier pricing (free/basic/pro) increases conversion by 40% vs single tier', 0.85, 'pricing_strategy', 'discovered'),
  ('ui_pattern', 'Progressive disclosure of payment after value demonstration increases CVR by 25%', 0.8, 'paywall_ux', 'discovered')
ON CONFLICT DO NOTHING;

INSERT INTO improvement_roadmap (title, description, category, expected_value_score, priority, status) VALUES
  ('Multi-tier pricing', 'Add free/0.01/0.03/0.10 USDC tiers for different API access levels', 'monetization', 85, 10, 'backlog'),
  ('Agent-to-agent discovery', 'Publish x402 manifest so other AI agents can discover and pay automatically', 'channel', 90, 5, 'backlog'),
  ('Retention loop', 'After first payment, offer discounted bulk access to increase LTV', 'monetization', 75, 20, 'backlog'),
  ('Social proof widget', 'Show live payment count and recent settlements to boost trust', 'distribution', 70, 30, 'backlog'),
  ('Multi-chain expansion', 'Add Arbitrum and Optimism USDC support alongside Base', 'channel', 60, 40, 'backlog')
ON CONFLICT DO NOTHING;
