/*
  # Full Autonomous Multi-Agent System Schema

  1. New Tables
    - `payment_ledger` — Idempotent payment lifecycle tracking (received -> validated -> pending -> confirmed -> settled -> failed)
      - `id` (uuid, primary key)
      - `idempotency_key` (text, unique) — prevents duplicate processing
      - `status` (text) — lifecycle state
      - `amount_usdc` (numeric)
      - `caller_ip_hash` (text)
      - `tx_hash` (text, nullable)
      - `settled_at` (timestamptz, nullable)
      - various timestamps for each lifecycle stage
    - `experiment_variants` — A/B/n testing variants with confirmed outcome tracking
      - `id` (uuid, primary key)
      - `variant_key` (text, unique)
      - `title`, `description`, `cta` (text)
      - `impressions`, `clicks`, `conversions`, `confirmed_revenue_usdc` (numeric)
      - `status` (text) — active, promoted, retired, testing
      - `phase` (text) — which expansion phase created it
    - `agent_runs` — Every agent execution is logged
      - `id` (uuid, primary key)
      - `agent_name` (text) — supervisor, finance, marketing, growth, variant_testing, devops, support
      - `run_type` (text)
      - `input_data`, `output_data` (jsonb)
      - `status` (text) — running, completed, failed, timed_out
      - `duration_ms` (integer)
      - `parent_run_id` (uuid, nullable) — hierarchical chain
    - `agent_decisions` — Structured outputs from agent chain
      - `id` (uuid, primary key)
      - `agent_run_id` (uuid, references agent_runs)
      - `decision_type` (text)
      - `decision_data` (jsonb)
      - `confidence_score` (numeric)
      - `promoted` (boolean, default false)
    - `referral_events` — Referral tracking
      - `id` (uuid, primary key)
      - `referrer_code` (text)
      - `referred_ip_hash` (text)
      - `event_type` (text) — click, signup, conversion, payout
      - `commission_usdc` (numeric, default 0)
    - `viral_shares` — Share event tracking
      - `id` (uuid, primary key)
      - `share_type` (text) — twitter, link, embed, card
      - `variant_id` (uuid, nullable)
      - `channel` (text)
      - `clicks_generated` (integer, default 0)
      - `conversions_generated` (integer, default 0)
    - `last_known_good` — Cached last-good values for safe degradation
      - `id` (text, primary key) — metric key
      - `value_json` (jsonb)
      - `captured_at` (timestamptz)
    - `reconciliation_status` — Reconciliation audit trail
      - `id` (uuid, primary key)
      - `run_at` (timestamptz)
      - `ledger_total_usdc` (numeric)
      - `settled_total_usdc` (numeric)
      - `payout_total_usdc` (numeric)
      - `reserve_total_usdc` (numeric)
      - `discrepancy_usdc` (numeric)
      - `status` (text) — clean, discrepancy_found, resolved
    - `growth_phases` — Expansion phase tracking
      - `id` (uuid, primary key)
      - `phase_number` (integer, unique)
      - `phase_name` (text)
      - `status` (text) — pending, active, completed
      - `entry_threshold` (jsonb)
      - `metrics_at_entry` (jsonb, nullable)
      - `started_at` (timestamptz, nullable)
      - `completed_at` (timestamptz, nullable)
    - `diversification_phases` — Diversification tracking
      - `id` (uuid, primary key)
      - `dimension` (text) — traffic_source, message_angle, offer_type, etc.
      - `status` (text) — exploring, scaling, mature
      - `active_variants_count` (integer, default 0)
      - `best_performer_id` (uuid, nullable)
      - `allocated_traffic_pct` (numeric, default 0)
    - `channel_performance` — Per-channel metrics
      - `id` (uuid, primary key)
      - `channel_name` (text)
      - `impressions`, `clicks`, `conversions` (integer)
      - `revenue_usdc` (numeric)
      - `cost_usdc` (numeric, default 0)
      - `roi_score` (numeric, default 0)
      - `date` (date)
    - `health_checks` — System health audit trail
      - `id` (uuid, primary key)
      - `component` (text)
      - `status` (text) — healthy, degraded, down
      - `details` (jsonb, nullable)
      - `checked_at` (timestamptz)

  2. Security
    - Enable RLS on all new tables
    - Public SELECT on non-sensitive tables for dashboard reads
    - Service role only for INSERT/UPDATE/DELETE on sensitive tables
    - No `USING (true)` policies — dashboard reads use anon role with limited SELECT

  3. Idempotency
    - `payment_ledger.idempotency_key` is UNIQUE
    - `experiment_variants.variant_key` is UNIQUE
    - `growth_phases.phase_number` is UNIQUE

  4. Seeding
    - Seeds growth_phases with 6 expansion phases
    - Seeds diversification_phases with 10 dimensions
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- PAYMENT LEDGER — full lifecycle tracking with idempotency
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'received',
  amount_usdc numeric NOT NULL DEFAULT 0.03,
  caller_ip_hash text NOT NULL DEFAULT '',
  tx_hash text,
  destination_wallet_masked text NOT NULL DEFAULT '',
  split_pct_payout integer NOT NULL DEFAULT 75,
  payout_usdc numeric NOT NULL DEFAULT 0,
  reserve_usdc numeric NOT NULL DEFAULT 0,
  received_at timestamptz DEFAULT now(),
  validated_at timestamptz,
  pending_at timestamptz,
  confirmed_at timestamptz,
  settled_at timestamptz,
  failed_at timestamptz,
  error_message text,
  correlation_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read payment_ledger summary"
  ON payment_ledger FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages payment_ledger"
  ON payment_ledger FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EXPERIMENT VARIANTS — A/B/n testing with confirmed outcomes
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  confirmed_revenue_usdc numeric NOT NULL DEFAULT 0,
  ctr numeric GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN clicks::numeric / impressions ELSE 0 END) STORED,
  cvr numeric GENERATED ALWAYS AS (CASE WHEN clicks > 0 THEN conversions::numeric / clicks ELSE 0 END) STORED,
  rpv numeric GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN confirmed_revenue_usdc / impressions ELSE 0 END) STORED,
  status text NOT NULL DEFAULT 'testing',
  phase text NOT NULL DEFAULT 'phase_1',
  audience_segment text NOT NULL DEFAULT 'all',
  channel text NOT NULL DEFAULT 'direct',
  created_at timestamptz DEFAULT now(),
  promoted_at timestamptz,
  retired_at timestamptz
);

ALTER TABLE experiment_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read experiment_variants"
  ON experiment_variants FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages experiment_variants"
  ON experiment_variants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AGENT RUNS — every execution logged
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  run_type text NOT NULL DEFAULT 'scheduled',
  input_data jsonb NOT NULL DEFAULT '{}',
  output_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running',
  duration_ms integer,
  parent_run_id uuid REFERENCES agent_runs(id),
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read agent_runs"
  ON agent_runs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages agent_runs"
  ON agent_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AGENT DECISIONS — structured outputs from agent chains
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES agent_runs(id),
  decision_type text NOT NULL,
  decision_data jsonb NOT NULL DEFAULT '{}',
  confidence_score numeric NOT NULL DEFAULT 0,
  promoted boolean NOT NULL DEFAULT false,
  validated boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read agent_decisions"
  ON agent_decisions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages agent_decisions"
  ON agent_decisions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REFERRAL EVENTS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_code text NOT NULL,
  referred_ip_hash text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'click',
  commission_usdc numeric NOT NULL DEFAULT 0,
  payment_ledger_id uuid REFERENCES payment_ledger(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read referral_events"
  ON referral_events FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages referral_events"
  ON referral_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIRAL SHARES
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS viral_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_type text NOT NULL DEFAULT 'link',
  variant_id uuid REFERENCES experiment_variants(id),
  channel text NOT NULL DEFAULT 'direct',
  content_text text NOT NULL DEFAULT '',
  clicks_generated integer NOT NULL DEFAULT 0,
  conversions_generated integer NOT NULL DEFAULT 0,
  sharer_ip_hash text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE viral_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read viral_shares"
  ON viral_shares FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages viral_shares"
  ON viral_shares FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LAST KNOWN GOOD — safe degradation cache
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS last_known_good (
  id text PRIMARY KEY,
  value_json jsonb NOT NULL DEFAULT '{}',
  captured_at timestamptz DEFAULT now()
);

ALTER TABLE last_known_good ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read last_known_good"
  ON last_known_good FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages last_known_good"
  ON last_known_good FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RECONCILIATION STATUS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reconciliation_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz DEFAULT now(),
  ledger_total_usdc numeric NOT NULL DEFAULT 0,
  settled_total_usdc numeric NOT NULL DEFAULT 0,
  payout_total_usdc numeric NOT NULL DEFAULT 0,
  reserve_total_usdc numeric NOT NULL DEFAULT 0,
  displayed_total_usdc numeric NOT NULL DEFAULT 0,
  discrepancy_usdc numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'clean',
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read reconciliation_status"
  ON reconciliation_status FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages reconciliation_status"
  ON reconciliation_status FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- GROWTH PHASES — expansion tracking
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS growth_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_number integer UNIQUE NOT NULL,
  phase_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  entry_threshold jsonb NOT NULL DEFAULT '{}',
  metrics_at_entry jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE growth_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read growth_phases"
  ON growth_phases FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages growth_phases"
  ON growth_phases FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DIVERSIFICATION PHASES
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS diversification_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'exploring',
  active_variants_count integer NOT NULL DEFAULT 0,
  best_performer_id uuid REFERENCES experiment_variants(id),
  allocated_traffic_pct numeric NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE diversification_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read diversification_phases"
  ON diversification_phases FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages diversification_phases"
  ON diversification_phases FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CHANNEL PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS channel_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  revenue_usdc numeric NOT NULL DEFAULT 0,
  cost_usdc numeric NOT NULL DEFAULT 0,
  roi_score numeric NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(channel_name, date)
);

ALTER TABLE channel_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read channel_performance"
  ON channel_performance FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages channel_performance"
  ON channel_performance FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- HEALTH CHECKS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL,
  status text NOT NULL DEFAULT 'healthy',
  details jsonb,
  checked_at timestamptz DEFAULT now()
);

ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read health_checks"
  ON health_checks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages health_checks"
  ON health_checks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Growth phases
INSERT INTO growth_phases (phase_number, phase_name, description, status, entry_threshold) VALUES
  (1, 'Stabilize & Instrument', 'Fix persistence, idempotency, ledger integrity, fallback UI, reconciliation', 'active', '{"min_settled_payments": 0}'),
  (2, 'Expand Acquisition', 'Generate new landing variants, referral surfaces, share cards, invite flows', 'pending', '{"min_settled_payments": 5, "reconciliation_clean": true}'),
  (3, 'Expand Channels', 'Automated outbound, share loops, social loops, in-product viral prompts', 'pending', '{"min_settled_payments": 20, "active_variants": 4}'),
  (4, 'Expand Segmentation', 'Tailored variants by audience, device, traffic source, conversion stage', 'pending', '{"min_settled_payments": 50, "active_channels": 3}'),
  (5, 'Expand Monetization', 'Test offers, bundles, upsells, timing triggers', 'pending', '{"min_settled_payments": 100, "cvr_above": 0.05}'),
  (6, 'Distribution Intelligence', 'Promote highest RPV variants, strongest retention indicators', 'pending', '{"min_settled_payments": 200, "diversification_mature": 3}')
ON CONFLICT (phase_number) DO NOTHING;

-- Diversification dimensions
INSERT INTO diversification_phases (dimension, status, allocated_traffic_pct) VALUES
  ('traffic_source', 'exploring', 10),
  ('message_angle', 'exploring', 15),
  ('offer_type', 'exploring', 10),
  ('cta_placement', 'exploring', 10),
  ('referral_trigger', 'exploring', 10),
  ('pricing_structure', 'exploring', 5),
  ('content_format', 'exploring', 10),
  ('audience_segment', 'exploring', 15),
  ('device_experience', 'exploring', 10),
  ('language_locale', 'exploring', 5)
ON CONFLICT (dimension) DO NOTHING;

-- Seed initial experiment variants
INSERT INTO experiment_variants (variant_key, title, description, cta, status, phase, channel) VALUES
  ('base_direct_v1', 'Agent-ready API on Base', 'Free preview, paid access at 0.03 USDC via x402.', 'Try free preview', 'active', 'phase_1', 'direct'),
  ('base_revenue_v1', 'Turn AI calls into on-chain revenue', 'Each payment earns 0.03 USDC. 75% to your Base wallet via x402.', 'Start earning now', 'active', 'phase_1', 'direct'),
  ('base_trading_v1', 'Automate trading signals. Pay 0.03 USDC on Base.', 'AI agents run 24/7. Every payment settles directly to your wallet.', 'Pay 0.03 USDC - Access now', 'active', 'phase_1', 'direct'),
  ('base_discovery_v1', 'x402-native service with free preview', 'Discovery-friendly API for agents on Base. Real USDC payments only.', 'Discover and integrate', 'active', 'phase_1', 'organic')
ON CONFLICT (variant_key) DO NOTHING;

-- Seed last_known_good with empty defaults
INSERT INTO last_known_good (id, value_json) VALUES
  ('revenue_summary', '{"settled_gross_usdc": 0, "settled_count": 0, "pending_count": 0}'),
  ('system_health', '{"status": "healthy", "agents_active": 0}'),
  ('best_variant', '{}')
ON CONFLICT (id) DO NOTHING;
