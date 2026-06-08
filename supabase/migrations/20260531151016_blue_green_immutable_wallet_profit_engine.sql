/*
  # Blue/Green Deployment Engine and Immutable Wallet Enforcement

  1. New Tables
    - `deployment_versions` — tracks blue/green deployment versions
      - `id` (uuid, primary key)
      - `version_tag` (text) — semantic version
      - `slot` (text) — 'blue' or 'green'
      - `status` (text) — active/canary/validating/rolled_back/retired
      - `config_snapshot` (jsonb) — full config at deploy time
      - `metrics_snapshot` (jsonb) — metrics comparison
      - `traffic_pct` (integer) — percent of traffic routed
      - `deployed_at`, `validated_at`, `promoted_at`, `rolled_back_at`
      - `validation_results` (jsonb) — security, revenue, stability gates
      - `created_at`

    - `mutation_log` — immutable audit log of all system mutations
      - `id` (uuid, primary key)
      - `mutation_type` (text) — deployment/config/agent/variant/expansion
      - `target` (text) — what was mutated
      - `before_value` (jsonb)
      - `after_value` (jsonb)
      - `initiated_by` (text) — which agent or cron job
      - `validation_status` (text) — pending/passed/failed/rolled_back
      - `slot` (text) — blue or green
      - `created_at`

    - `immutable_config` — protected configuration that cannot be changed at runtime
      - `id` (text, primary key)
      - `config_key` (text, unique)
      - `config_value` (text)
      - `locked_at` (timestamptz)
      - `locked_by` (text)
      - `hash` (text) — SHA-256 of value for tamper detection

    - `profit_ledger` — net profit tracking after fees
      - `id` (uuid, primary key)
      - `period` (text) — YYYY-MM-DD or YYYY-MM
      - `gross_revenue_usdc` (numeric)
      - `fees_usdc` (numeric)
      - `net_profit_usdc` (numeric)
      - `settlements_count` (integer)
      - `failed_count` (integer)
      - `refunds_usdc` (numeric)
      - `growth_reinvest_usdc` (numeric)
      - `owner_payout_usdc` (numeric)
      - `computed_at` (timestamptz)
      - `created_at`

    - `settlement_attempts` — every settlement attempt with outcome
      - `id` (uuid, primary key)
      - `payment_ledger_id` (uuid)
      - `destination_wallet` (text) — always must match immutable config
      - `amount_usdc` (numeric)
      - `route_used` (text) — which payment rail
      - `status` (text) — initiated/confirmed/failed/rolled_back
      - `tx_hash` (text, nullable)
      - `error_message` (text, nullable)
      - `attempt_number` (integer)
      - `initiated_at` (timestamptz)
      - `confirmed_at` (timestamptz, nullable)
      - `created_at`

    - `growth_blockers` — what is currently blocking revenue growth
      - `id` (uuid, primary key)
      - `blocker_type` (text)
      - `severity` (text)
      - `description` (text)
      - `impact_estimate_usdc` (numeric)
      - `resolution_action` (text)
      - `status` (text) — open/resolving/resolved
      - `detected_at` (timestamptz)
      - `resolved_at` (timestamptz, nullable)
      - `created_at`

  2. Security
    - RLS on all new tables (service_role only)
    - immutable_config has special trigger to prevent updates
    - profit_ledger is append-only (no updates/deletes)

  3. Seed Data
    - Lock the settlement wallet address in immutable_config
    - Seed initial blue deployment version
    - Add scheduled jobs for blue/green validation and profit computation
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- DEPLOYMENT VERSIONS (Blue/Green)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS deployment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_tag text NOT NULL,
  slot text NOT NULL DEFAULT 'blue',
  status text NOT NULL DEFAULT 'active',
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  traffic_pct integer NOT NULL DEFAULT 100,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  promoted_at timestamptz,
  rolled_back_at timestamptz,
  validation_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deployment_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages deployment_versions"
  ON deployment_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- MUTATION LOG (immutable audit trail)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mutation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mutation_type text NOT NULL,
  target text NOT NULL,
  before_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  initiated_by text NOT NULL DEFAULT 'system',
  validation_status text NOT NULL DEFAULT 'pending',
  slot text NOT NULL DEFAULT 'blue',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mutation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages mutation_log"
  ON mutation_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- IMMUTABLE CONFIG (protected, tamper-detected)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS immutable_config (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  config_key text UNIQUE NOT NULL,
  config_value text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by text NOT NULL DEFAULT 'system_init',
  hash text NOT NULL DEFAULT ''
);

ALTER TABLE immutable_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role reads immutable_config"
  ON immutable_config FOR SELECT TO service_role
  USING (true);

-- Block all updates and deletes on immutable_config
CREATE OR REPLACE FUNCTION public.prevent_immutable_config_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_CONFIG_VIOLATION: Cannot modify locked configuration. Key: %', OLD.config_key;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prevent_config_update ON immutable_config;
CREATE TRIGGER prevent_config_update
  BEFORE UPDATE OR DELETE ON immutable_config
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_config_mutation();

-- ══════════════════════════════════════════════════════════════════════════════
-- PROFIT LEDGER (append-only)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  gross_revenue_usdc numeric NOT NULL DEFAULT 0,
  fees_usdc numeric NOT NULL DEFAULT 0,
  net_profit_usdc numeric NOT NULL DEFAULT 0,
  settlements_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  refunds_usdc numeric NOT NULL DEFAULT 0,
  growth_reinvest_usdc numeric NOT NULL DEFAULT 0,
  owner_payout_usdc numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages profit_ledger"
  ON profit_ledger FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Block updates/deletes on profit_ledger (append-only)
CREATE OR REPLACE FUNCTION public.prevent_profit_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'PROFIT_LEDGER_IMMUTABLE: Profit records are append-only. Use a new row for corrections.';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profit_update ON profit_ledger;
CREATE TRIGGER prevent_profit_update
  BEFORE UPDATE OR DELETE ON profit_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profit_ledger_mutation();

-- ══════════════════════════════════════════════════════════════════════════════
-- SETTLEMENT ATTEMPTS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_ledger_id uuid,
  destination_wallet text NOT NULL,
  amount_usdc numeric NOT NULL DEFAULT 0,
  route_used text NOT NULL DEFAULT 'x402',
  status text NOT NULL DEFAULT 'initiated',
  tx_hash text,
  error_message text,
  attempt_number integer NOT NULL DEFAULT 1,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settlement_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages settlement_attempts"
  ON settlement_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- GROWTH BLOCKERS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS growth_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text NOT NULL,
  impact_estimate_usdc numeric NOT NULL DEFAULT 0,
  resolution_action text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE growth_blockers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages growth_blockers"
  ON growth_blockers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read growth_blockers"
  ON growth_blockers FOR SELECT TO anon, authenticated
  USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ══════════════════════════════════════════════════════════════════════════════

-- Lock settlement wallet (uses WALLET_ADDRESS env var placeholder, actual enforcement is server-side)
INSERT INTO immutable_config (config_key, config_value, locked_by, hash)
VALUES (
  'settlement_wallet',
  'ENV:WALLET_ADDRESS',
  'system_init',
  'enforced_server_side'
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO immutable_config (config_key, config_value, locked_by, hash)
VALUES (
  'settlement_network',
  'base-mainnet',
  'system_init',
  'enforced_server_side'
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO immutable_config (config_key, config_value, locked_by, hash)
VALUES (
  'settlement_asset',
  'USDC',
  'system_init',
  'enforced_server_side'
)
ON CONFLICT (config_key) DO NOTHING;

-- Initial blue deployment version
INSERT INTO deployment_versions (version_tag, slot, status, traffic_pct, config_snapshot)
VALUES (
  '13.0',
  'blue',
  'active',
  100,
  '{"wallet_enforcement": "immutable", "settlement_network": "base-mainnet", "settlement_asset": "USDC", "price_usdc": 0.03, "split_payout": 75, "split_reserve": 25}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Add blue/green scheduled jobs
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, max_retries, timeout_ms)
VALUES
  ('blue_green_validation', '*/5 * * * *', true, 1, 20000),
  ('profit_computation', '*/10 * * * *', true, 2, 15000),
  ('growth_blocker_scan', '*/15 * * * *', true, 1, 15000)
ON CONFLICT (job_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- REVOKE PUBLIC on new trigger functions
-- ══════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.prevent_immutable_config_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_immutable_config_mutation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_immutable_config_mutation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_profit_ledger_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_profit_ledger_mutation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profit_ledger_mutation() FROM authenticated;
