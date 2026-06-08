/*
  # Viral Growth Engine, Wallet Provider Registry, and Auto-Start Infrastructure

  1. New Tables
    - `wallet_providers` — registry of supported wallet/payment providers with detection metadata
      - `id` (uuid, primary key)
      - `provider_id` (text, unique) — e.g. 'metamask', 'coinbase', 'walletconnect'
      - `provider_name` (text) — display name
      - `chain_support` (text[]) — supported chains
      - `payment_support` (text[]) — supported payment types
      - `mobile_support` (boolean)
      - `desktop_support` (boolean)
      - `fallback_order` (integer) — priority for fallback routing
      - `status` (text) — active/degraded/unavailable
      - `detection_method` (text) — how to detect availability
      - `install_url` (text)
      - `icon_url` (text)
      - `created_at`, `updated_at`

    - `wallet_connections` — tracks all wallet connection attempts/results
      - `id` (uuid, primary key)
      - `provider_id` (text)
      - `wallet_address_hash` (text) — hashed for privacy
      - `event_type` (text) — attempted/connected/failed/disconnected
      - `chain_id` (text)
      - `error_message` (text, nullable)
      - `route_selected` (text, nullable) — which payment route was chosen
      - `session_id` (text) — group events per session
      - `created_at`

    - `viral_artifacts` — auto-generated shareable content
      - `id` (uuid, primary key)
      - `artifact_type` (text) — result_card/win_snapshot/referral_link/summary/invite_page/social_caption
      - `trigger_event` (text) — what created this (payment_confirmed/variant_promoted/milestone)
      - `content` (jsonb) — structured artifact content
      - `share_url` (text, nullable)
      - `variant_id` (text, nullable)
      - `impressions` (integer, default 0)
      - `clicks` (integer, default 0)
      - `conversions` (integer, default 0)
      - `status` (text) — active/expired/retired
      - `expires_at` (timestamptz, nullable)
      - `created_at`

    - `viral_loops` — tracks active viral loop mechanics
      - `id` (uuid, primary key)
      - `loop_type` (text) — referral/share/content/result/waitlist/invite/social_proof
      - `status` (text) — active/paused/testing
      - `trigger_condition` (jsonb) — when this loop fires
      - `content_template` (jsonb) — dynamic content generation template
      - `metrics` (jsonb) — performance metrics (impressions, shares, conversions)
      - `conversion_rate` (numeric, default 0)
      - `revenue_attributed_usdc` (numeric, default 0)
      - `last_triggered_at` (timestamptz, nullable)
      - `created_at`, `updated_at`

    - `engine_state` — singleton tracking the autonomous engine operational state
      - `id` (text, primary key, default 'singleton')
      - `mode` (text) — learning/testing/recruiting/promoting/expanding/settling/reconciling/degraded
      - `submode` (text, nullable)
      - `started_at` (timestamptz)
      - `last_heartbeat_at` (timestamptz)
      - `components_status` (jsonb) — per-component health
      - `degraded_components` (text[]) — list of degraded component names
      - `active_since` (timestamptz)
      - `total_autonomous_hours` (numeric, default 0)
      - `total_revenue_usdc` (numeric, default 0)
      - `decisions_made` (integer, default 0)
      - `expansions_completed` (integer, default 0)
      - `agents_recruited` (integer, default 0)

  2. Security
    - RLS enabled on all new tables
    - Service-role only policies for write access
    - Engine state readable by anon for dashboard display

  3. Auto-Start
    - Seed wallet providers with known providers
    - Seed viral loops with all required loop types
    - Ensure engine_state singleton exists
    - Add scheduled jobs for viral artifact generation and wallet health check
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- WALLET PROVIDER REGISTRY
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text UNIQUE NOT NULL,
  provider_name text NOT NULL,
  chain_support text[] NOT NULL DEFAULT ARRAY[]::text[],
  payment_support text[] NOT NULL DEFAULT ARRAY[]::text[],
  mobile_support boolean NOT NULL DEFAULT false,
  desktop_support boolean NOT NULL DEFAULT true,
  fallback_order integer NOT NULL DEFAULT 99,
  status text NOT NULL DEFAULT 'active',
  detection_method text NOT NULL DEFAULT 'injected_provider',
  install_url text NOT NULL DEFAULT '',
  icon_url text NOT NULL DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wallet_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages wallet_providers"
  ON wallet_providers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read wallet_providers"
  ON wallet_providers FOR SELECT TO anon, authenticated
  USING (status = 'active');

-- ══════════════════════════════════════════════════════════════════════════════
-- WALLET CONNECTIONS (audit trail)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  wallet_address_hash text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'attempted',
  chain_id text NOT NULL DEFAULT 'base-mainnet',
  error_message text,
  route_selected text,
  session_id text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wallet_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages wallet_connections"
  ON wallet_connections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- VIRAL ARTIFACTS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS viral_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type text NOT NULL,
  trigger_event text NOT NULL DEFAULT 'system_generated',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_url text,
  variant_id text,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE viral_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages viral_artifacts"
  ON viral_artifacts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read active viral_artifacts"
  ON viral_artifacts FOR SELECT TO anon, authenticated
  USING (status = 'active');

-- ══════════════════════════════════════════════════════════════════════════════
-- VIRAL LOOPS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS viral_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_type text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active',
  trigger_condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{"impressions":0,"shares":0,"conversions":0}'::jsonb,
  conversion_rate numeric NOT NULL DEFAULT 0,
  revenue_attributed_usdc numeric NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE viral_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages viral_loops"
  ON viral_loops FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read viral_loops"
  ON viral_loops FOR SELECT TO anon, authenticated
  USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- ENGINE STATE (autonomous system state)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engine_state (
  id text PRIMARY KEY DEFAULT 'singleton',
  mode text NOT NULL DEFAULT 'learning',
  submode text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  components_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  degraded_components text[] NOT NULL DEFAULT ARRAY[]::text[],
  active_since timestamptz NOT NULL DEFAULT now(),
  total_autonomous_hours numeric NOT NULL DEFAULT 0,
  total_revenue_usdc numeric NOT NULL DEFAULT 0,
  decisions_made integer NOT NULL DEFAULT 0,
  expansions_completed integer NOT NULL DEFAULT 0,
  agents_recruited integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engine_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages engine_state"
  ON engine_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read engine_state"
  ON engine_state FOR SELECT TO anon, authenticated
  USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DATA — Wallet Providers
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO wallet_providers (provider_id, provider_name, chain_support, payment_support, mobile_support, desktop_support, fallback_order, detection_method, install_url, status)
VALUES
  ('coinbase', 'Coinbase Wallet', ARRAY['base','ethereum','polygon','arbitrum','optimism'], ARRAY['x402','eip-681','direct_transfer'], true, true, 1, 'window.ethereum.isCoinbaseWallet', 'https://www.coinbase.com/wallet', 'active'),
  ('metamask', 'MetaMask', ARRAY['base','ethereum','polygon','arbitrum','optimism','avalanche'], ARRAY['x402','eip-681','direct_transfer'], true, true, 2, 'window.ethereum.isMetaMask && !window.ethereum.isCoinbaseWallet', 'https://metamask.io/download/', 'active'),
  ('walletconnect', 'WalletConnect', ARRAY['base','ethereum','polygon','arbitrum','optimism'], ARRAY['x402','eip-681'], true, true, 3, 'walletconnect_modal', 'https://walletconnect.com/', 'active'),
  ('rabby', 'Rabby Wallet', ARRAY['base','ethereum','polygon','arbitrum'], ARRAY['x402','direct_transfer'], false, true, 4, 'window.ethereum.isRabby', 'https://rabby.io/', 'active'),
  ('injected', 'Browser Wallet', ARRAY['base','ethereum'], ARRAY['x402','direct_transfer'], false, true, 99, 'window.ethereum && !known_provider', '', 'active')
ON CONFLICT (provider_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DATA — Viral Loops
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO viral_loops (loop_type, status, trigger_condition, content_template)
VALUES
  ('referral', 'active', '{"after": "payment_confirmed", "cooldown_hours": 0}', '{"headline": "Share & earn {commission_pct}% on every referral", "cta": "Copy referral link", "channels": ["twitter","telegram","discord","email"]}'),
  ('share', 'active', '{"after": "payment_confirmed", "cooldown_hours": 24}', '{"headline": "Share your access", "format": "social_caption", "channels": ["twitter","linkedin"]}'),
  ('content', 'active', '{"after": "variant_promoted", "cooldown_hours": 6}', '{"headline": "New insight generated", "format": "result_card", "channels": ["twitter","blog"]}'),
  ('result', 'active', '{"after": "payment_confirmed", "cooldown_hours": 0}', '{"headline": "Your API result is ready", "format": "win_snapshot", "cta": "Share result"}'),
  ('waitlist', 'testing', '{"after": "page_view", "condition": "capacity_limited"}', '{"headline": "Join the waitlist for priority access", "cta": "Get early access"}'),
  ('invite', 'active', '{"after": "payment_confirmed", "min_payments": 2}', '{"headline": "Invite your team", "format": "invite_page", "reward": "free_call"}'),
  ('social_proof', 'active', '{"after": "milestone_reached", "milestones": [10, 50, 100, 500]}', '{"headline": "{count} payments settled on Base", "format": "milestone_card", "channels": ["twitter","telegram"]}')
ON CONFLICT (loop_type) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DATA — Engine State Singleton
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO engine_state (id, mode, started_at, last_heartbeat_at, active_since, components_status)
VALUES ('singleton', 'learning', now(), now(), now(), '{
  "scheduler": "initializing",
  "queue_worker": "initializing",
  "watchdog": "initializing",
  "orchestrator": "initializing",
  "recruiter": "initializing",
  "payment_router": "initializing",
  "reconciliation": "initializing",
  "intelligence": "initializing",
  "viral_engine": "initializing",
  "expansion": "initializing"
}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  last_heartbeat_at = now(),
  updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════════
-- ADDITIONAL SCHEDULED JOBS for viral & wallet subsystems
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, max_retries, timeout_ms)
VALUES
  ('viral_artifact_generation', '*/10 * * * *', true, 2, 20000),
  ('viral_loop_evaluation', '*/30 * * * *', true, 2, 15000),
  ('wallet_health_check', '*/15 * * * *', true, 1, 10000),
  ('engine_heartbeat', '*/1 * * * *', true, 0, 5000)
ON CONFLICT (job_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- AUTO-START FUNCTION — Called by pg_cron on first tick to bootstrap engine
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bootstrap_engine()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Ensure engine state is running
  UPDATE public.engine_state
  SET mode = CASE
    WHEN mode = 'learning' AND (SELECT paid_calls FROM public.system_metrics WHERE id = 'singleton') > 0
    THEN 'testing'
    ELSE mode
  END,
  last_heartbeat_at = now(),
  updated_at = now()
  WHERE id = 'singleton';

  -- Ensure orchestrator is initialized
  INSERT INTO public.orchestrator_state (id, current_phase, total_ticks, watchdog_last_ping)
  VALUES ('singleton', 'INIT', 0, now())
  ON CONFLICT (id) DO UPDATE SET watchdog_last_ping = now();

  -- Reap any stale job leases
  PERFORM public.reap_expired_leases();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_engine() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_engine() FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_engine() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_engine() TO service_role;

-- Schedule bootstrap to run every minute (ensures auto-start)
SELECT cron.schedule(
  'engine_bootstrap',
  '*/1 * * * *',
  $$SELECT public.bootstrap_engine()$$
);
