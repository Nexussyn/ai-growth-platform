/*
  # Monetization Engine Schema

  1. New Tables
    - `pricing_plans` - Free, starter, pro, enterprise plans with included credits
    - `user_subscriptions` - Active subscriptions per user
    - `usage_meter` - Per-action usage metering
    - `credit_transactions` - Credit ledger (purchases, rewards, consumption)
    - `pricing_experiments` - A/B tests on pricing structures
    - `referral_rewards` - Referral payout tracking
    - `overage_events` - Plan limit overage tracking
    - `net_profit_summary` - Periodic profit snapshots

  2. Security
    - RLS enabled on all tables
    - Service role only access for financial tables

  3. Seed Data
    - 4 pricing plans (free, starter, pro, enterprise)
    - Initial pricing experiment
    - Improvement proposals using existing table schema
*/

-- Pricing Plans
CREATE TABLE IF NOT EXISTS pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text UNIQUE NOT NULL,
  name text NOT NULL,
  price_usdc_monthly numeric NOT NULL DEFAULT 0,
  price_usdc_annual numeric NOT NULL DEFAULT 0,
  included_credits integer NOT NULL DEFAULT 0,
  overage_rate_usdc numeric NOT NULL DEFAULT 0.03,
  features jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages pricing plans" ON pricing_plans FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO pricing_plans (plan_key, name, price_usdc_monthly, price_usdc_annual, included_credits, overage_rate_usdc, features, sort_order) VALUES
  ('free', 'Free', 0, 0, 10, 0.05, '{"agents": 1, "max_workflows": 3, "speed": "standard", "support": "community"}', 0),
  ('starter', 'Starter', 4.99, 49.99, 200, 0.03, '{"agents": 3, "max_workflows": 20, "speed": "fast", "support": "email"}', 1),
  ('pro', 'Pro', 19.99, 199.99, 1000, 0.02, '{"agents": 5, "max_workflows": 100, "speed": "priority", "support": "priority", "advanced_automation": true}', 2),
  ('enterprise', 'Enterprise', 99.99, 999.99, 10000, 0.01, '{"agents": "unlimited", "max_workflows": "unlimited", "speed": "dedicated", "support": "dedicated", "advanced_automation": true, "custom_agents": true, "sla": true}', 3)
ON CONFLICT (plan_key) DO NOTHING;

-- User Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  plan_id uuid NOT NULL REFERENCES pricing_plans(id),
  status text NOT NULL DEFAULT 'active',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT now() + interval '30 days',
  credits_used integer NOT NULL DEFAULT 0,
  credits_remaining integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages subscriptions" ON user_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Usage Meter
CREATE TABLE IF NOT EXISTS usage_meter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  action_type text NOT NULL,
  credits_consumed integer NOT NULL DEFAULT 1,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE usage_meter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages usage meter" ON usage_meter FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Credit Transactions
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  amount integer NOT NULL,
  source text NOT NULL,
  reference_id text,
  balance_after integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages credit transactions" ON credit_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Pricing Experiments
CREATE TABLE IF NOT EXISTS pricing_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active',
  variants jsonb NOT NULL DEFAULT '[]',
  metric text NOT NULL DEFAULT 'net_profit',
  winner_variant text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pricing_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages pricing experiments" ON pricing_experiments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Referral Rewards
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id text NOT NULL,
  referred_id text NOT NULL,
  reward_type text NOT NULL DEFAULT 'credits',
  reward_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  triggered_by text NOT NULL DEFAULT 'signup',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages referral rewards" ON referral_rewards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Overage Events
CREATE TABLE IF NOT EXISTS overage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  subscription_id uuid REFERENCES user_subscriptions(id),
  credits_over integer NOT NULL DEFAULT 0,
  charge_usdc numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE overage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages overage events" ON overage_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Net Profit Summary
CREATE TABLE IF NOT EXISTS net_profit_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  gross_revenue_usdc numeric NOT NULL DEFAULT 0,
  confirmed_revenue_usdc numeric NOT NULL DEFAULT 0,
  pending_revenue_usdc numeric NOT NULL DEFAULT 0,
  payment_fees_usdc numeric NOT NULL DEFAULT 0,
  inference_cost_usdc numeric NOT NULL DEFAULT 0,
  infra_cost_usdc numeric NOT NULL DEFAULT 0,
  referral_rewards_usdc numeric NOT NULL DEFAULT 0,
  net_profit_usdc numeric NOT NULL DEFAULT 0,
  visitors integer NOT NULL DEFAULT 0,
  activations integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  revenue_per_visitor numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE net_profit_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages net profit summary" ON net_profit_summary FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed pricing experiment
INSERT INTO pricing_experiments (experiment_key, status, variants, metric) VALUES
  ('initial_price_test', 'active', '[{"key":"base_003","price_usdc":0.03,"label":"Standard"},{"key":"low_001","price_usdc":0.01,"label":"Low entry"},{"key":"high_005","price_usdc":0.05,"label":"Premium"},{"key":"tiered","price_usdc":0.01,"label":"Tiered: 0.01/0.03/0.10"}]', 'net_profit')
ON CONFLICT (experiment_key) DO NOTHING;

-- Seed improvement proposals (using existing table schema)
INSERT INTO improvement_proposals (proposal_id, source, source_agent, category, title, rationale, expected_impact, confidence, risk, status) VALUES
  ('prop_pricing_tiers', 'self_improvement', 'pricing_engine', 'pricing', 'Test tiered pricing with volume discounts', 'Offer 0.01 for first 50 calls, 0.03 standard, 0.10 premium priority routing', '{"metric": "revenue", "estimate": "+30%"}', 0.7, 'low', 'proposed'),
  ('prop_referral_loop', 'growth_scan', 'growth_agent', 'growth', 'Enable referral reward loop', 'Award 5 free credits per successful referral conversion to increase viral coefficient', '{"metric": "conversion", "estimate": "+20%"}', 0.8, 'low', 'proposed'),
  ('prop_mobile_landing', 'watchdog', 'watchdog', 'variant', 'Add mobile-first landing page', 'Detect mobile context and show simplified CTA with deep-link to wallet apps', '{"metric": "conversion", "estimate": "+15%"}', 0.75, 'low', 'proposed'),
  ('prop_content_agent', 'recruiter', 'recruiter', 'agent', 'Recruit content-generation agent', 'Agent that auto-generates blog posts, social cards, and share snippets from outcomes', '{"metric": "revenue", "estimate": "+10%"}', 0.6, 'medium', 'proposed'),
  ('prop_upsell_trigger', 'self_improvement', 'monetization_engine', 'workflow', 'Auto-upsell after 5th free call', 'Show contextual upgrade prompt when user hits 50% of free credit limit', '{"metric": "revenue", "estimate": "+25%"}', 0.85, 'low', 'proposed')
ON CONFLICT (proposal_id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usage_meter_user_id ON usage_meter(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_meter_created_at ON usage_meter(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_overage_events_user ON overage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_net_profit_summary_period ON net_profit_summary(period_start);
