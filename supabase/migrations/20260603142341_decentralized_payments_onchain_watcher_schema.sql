/*
  # Decentralized USDC payment infrastructure (no-key, public-RPC)

  1. Why
    - The user requires immediate, decentralized profit collection with NO API keys.
    - All inbound USDC transfers on Base to the sealed owner wallet must be detected, recorded, and routed automatically.
    - This migration creates the schema needed to (a) issue payment intents, (b) ingest on-chain USDC Transfer events, (c) rotate across multiple free public RPC endpoints, (d) keep a per-chain scan cursor.

  2. New tables
    - `payment_intents` — pending requests created by edge function (id, reference, amount_usdc, description, network, currency, destination, status, expires_at, matched_tx_hash, matched_at, created_at). Status: pending|matched|expired|cancelled.
    - `onchain_payments` — confirmed USDC Transfer receipts (network, chain_id, token_contract, tx_hash, log_index UNIQUE, block_number, block_hash, from_address, destination, amount_raw, amount_usd, intent_id, status, confirmed_at, raw_log).
    - `chain_watch_state` — last scanned block per (network, token_contract) cursor to avoid re-scanning.
    - `chain_rpc_endpoints` — rotating registry of free, no-key public RPC URLs (Base mainnet by default), with health counters.

  3. Triggers
    - `converge_to_owner_wallet` is attached to both `payment_intents` and `onchain_payments` so any attempt to write a `destination` other than the sealed owner wallet is silently rewritten and audited in `profit_lock_violations`.

  4. Security (RLS)
    - All four tables have RLS enabled.
    - Public READ on `payment_intents`, `onchain_payments`, `chain_watch_state`, `chain_rpc_endpoints` (transparency: anyone may verify the chain state, the receiving address, the public RPCs, and recent receipts).
    - All writes are restricted to `service_role` (RPCs / edge functions only).

  5. Seed data
    - Five Base mainnet public no-key RPC endpoints (mainnet.base.org, base.llamarpc.com, base-rpc.publicnode.com, base.blockpi.network/v1/rpc/public, 1rpc.io/base).
    - One scan cursor for the canonical USDC contract on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).

  6. Notes
    - No private key is ever stored, used, or required: receiving funds requires nothing on our side beyond the public address.
    - The watcher only READS chain logs via public RPC. It cannot move funds.
*/

CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(8),'hex'),
  amount_usdc numeric(18,6) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  network text NOT NULL DEFAULT 'Base',
  currency text NOT NULL DEFAULT 'USDC',
  destination text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  matched_tx_hash text,
  matched_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onchain_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL DEFAULT 'Base',
  chain_id integer NOT NULL DEFAULT 8453,
  token_contract text NOT NULL DEFAULT '',
  tx_hash text NOT NULL,
  log_index integer NOT NULL DEFAULT 0,
  block_number bigint NOT NULL DEFAULT 0,
  block_hash text NOT NULL DEFAULT '',
  from_address text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  amount_raw numeric(78,0) NOT NULL DEFAULT 0,
  amount_usd numeric(18,6) NOT NULL DEFAULT 0,
  intent_id uuid REFERENCES payment_intents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'confirmed',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  raw_log jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT onchain_payments_tx_log_uq UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS onchain_payments_block_idx ON onchain_payments(block_number DESC);
CREATE INDEX IF NOT EXISTS onchain_payments_dest_idx ON onchain_payments(destination);
CREATE INDEX IF NOT EXISTS onchain_payments_intent_idx ON onchain_payments(intent_id);
CREATE INDEX IF NOT EXISTS payment_intents_status_idx ON payment_intents(status);

CREATE TABLE IF NOT EXISTS chain_watch_state (
  id text PRIMARY KEY,
  network text NOT NULL DEFAULT 'Base',
  chain_id integer NOT NULL DEFAULT 8453,
  token_contract text NOT NULL DEFAULT '',
  last_scanned_block bigint NOT NULL DEFAULT 0,
  last_scan_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_rpc_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL DEFAULT 'Base',
  chain_id integer NOT NULL DEFAULT 8453,
  url text NOT NULL,
  no_key boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  fail_count integer NOT NULL DEFAULT 0,
  ok_count integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chain_rpc_endpoints_net_url_uq UNIQUE (network, url)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'converge_payment_intents'
  ) THEN
    CREATE TRIGGER converge_payment_intents
      BEFORE INSERT OR UPDATE ON payment_intents
      FOR EACH ROW EXECUTE FUNCTION converge_to_owner_wallet();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'converge_onchain_payments'
  ) THEN
    CREATE TRIGGER converge_onchain_payments
      BEFORE INSERT OR UPDATE ON onchain_payments
      FOR EACH ROW EXECUTE FUNCTION converge_to_owner_wallet();
  END IF;
END $$;

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE onchain_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_watch_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_rpc_endpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_intents' AND policyname='Public read payment_intents') THEN
    CREATE POLICY "Public read payment_intents" ON payment_intents FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='onchain_payments' AND policyname='Public read onchain_payments') THEN
    CREATE POLICY "Public read onchain_payments" ON onchain_payments FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chain_watch_state' AND policyname='Public read chain_watch_state') THEN
    CREATE POLICY "Public read chain_watch_state" ON chain_watch_state FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chain_rpc_endpoints' AND policyname='Public read chain_rpc_endpoints') THEN
    CREATE POLICY "Public read chain_rpc_endpoints" ON chain_rpc_endpoints FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

INSERT INTO chain_rpc_endpoints (network, chain_id, url, notes) VALUES
  ('Base', 8453, 'https://mainnet.base.org', 'official public no-key'),
  ('Base', 8453, 'https://base.llamarpc.com', 'llama public no-key'),
  ('Base', 8453, 'https://base-rpc.publicnode.com', 'publicnode public no-key'),
  ('Base', 8453, 'https://base.blockpi.network/v1/rpc/public', 'blockpi public no-key'),
  ('Base', 8453, 'https://1rpc.io/base', '1rpc public no-key')
ON CONFLICT (network, url) DO NOTHING;

INSERT INTO chain_watch_state (id, network, chain_id, token_contract, last_scanned_block)
VALUES ('base-usdc', 'Base', 8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 0)
ON CONFLICT (id) DO NOTHING;