/*
  # Payment Log and Wallet Config Tables

  ## Summary
  Adds two server-side-only tables to support fully server-side monetization:

  ### New Tables

  1. `payment_log`
     - Immutable audit trail for every payment attempt, success, and failure
     - Written exclusively by the edge function using service_role
     - Columns:
       - `id` (uuid, pk)
       - `api_call_id` (uuid, FK → api_calls.id, nullable — set after api_call row created)
       - `event_type` (text) — 'attempt' | 'success' | 'failure' | 'rate_limited' | 'wallet_missing'
       - `amount_usdc` (decimal 12,6) — amount in USDC (0.03 for standard calls)
       - `destination_wallet_masked` (text) — last 6 chars of wallet only, never full address
       - `caller_ip_hash` (text) — SHA-256 of caller IP for rate-limit correlation, not PII-safe raw IP
       - `error_message` (text, nullable)
       - `created_at` (timestamptz)
     - RLS: service_role only for all operations

  2. `wallet_config`
     - Single-row table confirming whether WALLET_ADDRESS secret is configured
     - Never stores the actual wallet address — only a masked preview and a boolean flag
     - Written by edge function on startup / health check
     - Columns:
       - `id` (uuid, pk)
       - `configured` (boolean) — true when WALLET_ADDRESS env secret is non-empty
       - `masked_address` (text) — last 6 chars only e.g. "…a1b2c3", empty if not configured
       - `network` (text default 'Base')
       - `currency` (text default 'USDC')
       - `updated_at` (timestamptz)
     - RLS: public SELECT (dashboard needs to show wallet-missing warning), service_role INSERT/UPDATE/DELETE

  ## Security Changes
  - Both tables have RLS enabled from creation
  - `payment_log` is entirely service_role — no anon or authenticated client access
  - `wallet_config` allows public read so the dashboard can detect wallet-not-configured state
    without exposing any secret — only the boolean + masked suffix is readable
  - No full wallet address is ever stored in the database

  ## Important Notes
  1. The full WALLET_ADDRESS value lives ONLY in the edge function environment secret
  2. The dashboard reads `wallet_config.configured` to decide whether to show the config warning
  3. `payment_log.destination_wallet_masked` stores only the last 6 chars for audit traceability
     without re-exposing the full address
*/

-- Payment log table
CREATE TABLE IF NOT EXISTS payment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_call_id uuid REFERENCES api_calls(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('attempt', 'success', 'failure', 'rate_limited', 'wallet_missing')),
  amount_usdc decimal(12,6) DEFAULT 0.000000,
  destination_wallet_masked text DEFAULT '',
  caller_ip_hash text DEFAULT '',
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_log_created_at ON payment_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_log_event_type ON payment_log(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_log_api_call ON payment_log(api_call_id);

ALTER TABLE payment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_log_service_role_select"
  ON payment_log FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "payment_log_service_role_insert"
  ON payment_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "payment_log_service_role_update"
  ON payment_log FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "payment_log_service_role_delete"
  ON payment_log FOR DELETE
  USING (auth.role() = 'service_role');

-- Wallet config table (no actual address stored)
CREATE TABLE IF NOT EXISTS wallet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configured boolean NOT NULL DEFAULT false,
  masked_address text NOT NULL DEFAULT '',
  network text NOT NULL DEFAULT 'Base',
  currency text NOT NULL DEFAULT 'USDC',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wallet_config ENABLE ROW LEVEL SECURITY;

-- Public can read wallet_config so the dashboard can show the wallet-missing banner
-- Only configured (boolean) and masked_address (last 6 chars) are stored — no secret exposed
CREATE POLICY "wallet_config_public_select"
  ON wallet_config FOR SELECT
  TO public
  USING (true);

CREATE POLICY "wallet_config_service_role_insert"
  ON wallet_config FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "wallet_config_service_role_update"
  ON wallet_config FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "wallet_config_service_role_delete"
  ON wallet_config FOR DELETE
  USING (auth.role() = 'service_role');

-- Seed a default unconfigured row so the dashboard always gets a result
INSERT INTO wallet_config (configured, masked_address, network, currency)
VALUES (false, '', 'Base', 'USDC')
ON CONFLICT DO NOTHING;
