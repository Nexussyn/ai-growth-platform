/*
  # Public payable product catalog + multi-chain watch state

  1. New tables
    - `payment_products`
      - Real, sellable, autonomous-deliverable products. Each has slug, title, description, price_usdc, deliverable_kind ('research_report'|'code_review'|'test_suite'|'integration_report'|'donation'|'sponsorship'), accepted_chains text[], active boolean, created_at.
    - `payment_chains`
      - Per-EVM-chain receiving config (chain_id, name, token_contract, decimals, watch_address, active, last_scanned_block, public_rpcs jsonb, created_at). Same owner address works across all EVM chains, so watch_address is the canonical full hex.

  2. Seed data
    - 6 catalog products, all denominated in USDC, accepted on all 4 chains by default:
      `support_5` $5 sponsorship, `support_25` $25 sponsorship, `support_100` $100 sponsorship,
      `code_review_25` $25 AI code review, `research_report_50` $50 deep research report,
      `priority_integration_250` $250 priority integration.
    - 4 chains seeded (Base, Polygon, Arbitrum, Optimism) with the canonical owner watch address and free public RPCs.

  3. Security
    - RLS enabled on both tables.
    - Public READ on `payment_products` and `payment_chains` (catalog and chain config are intentionally public, transparency).
    - Service-role only writes.

  4. Notes
    - The user's address `0xb438d36b425b504724a1c72aa0941c80cb940995` is the same on every EVM chain (deterministic by curve), so no key material is added — the same owner can receive on Base, Polygon, Arbitrum, and Optimism with zero extra setup.
*/

CREATE TABLE IF NOT EXISTS payment_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_usdc numeric(18,6) NOT NULL,
  deliverable_kind text NOT NULL DEFAULT 'donation',
  accepted_chains text[] NOT NULL DEFAULT ARRAY['Base','Polygon','Arbitrum','Optimism'],
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_chains (
  id text PRIMARY KEY,
  network text NOT NULL,
  chain_id integer NOT NULL,
  token_symbol text NOT NULL DEFAULT 'USDC',
  token_contract text NOT NULL,
  token_decimals integer NOT NULL DEFAULT 6,
  watch_address text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_scanned_block bigint NOT NULL DEFAULT 0,
  last_scan_at timestamptz,
  public_rpcs jsonb NOT NULL DEFAULT '[]'::jsonb,
  explorer_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_chains ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_products' AND policyname='Public read payment_products') THEN
    CREATE POLICY "Public read payment_products" ON payment_products FOR SELECT TO anon, authenticated USING (active);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_chains' AND policyname='Public read payment_chains') THEN
    CREATE POLICY "Public read payment_chains" ON payment_chains FOR SELECT TO anon, authenticated USING (active);
  END IF;
END $$;

INSERT INTO payment_products (slug, title, description, price_usdc, deliverable_kind, display_order) VALUES
  ('support_5', 'Sponsor the network — $5', 'Send $5 USDC to keep the open federation running. No subscription, no key, fully on-chain. Receipt is public.', 5, 'donation', 10),
  ('support_25', 'Sponsor the network — $25', 'Power one full day of autonomous research, watch loops, and federation outreach. Public receipt on-chain.', 25, 'donation', 20),
  ('support_100', 'Sponsor the network — $100', 'Underwrite a full week of multilingual discovery, evidence capture, and code-agent activity. Public on-chain receipt.', 100, 'sponsorship', 30),
  ('code_review_25', 'AI code review — $25', 'Submit a snippet via the bridge endpoint and receive a structured security + performance review (real model output, real artefact, real receipt).', 25, 'code_review', 40),
  ('research_report_50', 'Deep research report — $50', 'Topic-driven multi-source research synthesis (OpenAlex, arXiv, GitHub, HN, Wikipedia) with cited evidence. Delivered as JSON + markdown.', 50, 'research_report', 50),
  ('priority_integration_250', 'Priority integration slot — $250', 'Reserve a priority slot for federation integration: your manifest is live-probed, registered, and indexed within 1 hour of payment confirmation.', 250, 'integration_report', 60)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  price_usdc = EXCLUDED.price_usdc,
  display_order = EXCLUDED.display_order,
  active = true;

INSERT INTO payment_chains (id, network, chain_id, token_symbol, token_contract, token_decimals, watch_address, public_rpcs, explorer_url) VALUES
  ('base',     'Base',     8453,   'USDC', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, '0xb438d36b425b504724a1c72aa0941c80cb940995',
    '["https://mainnet.base.org","https://base.llamarpc.com","https://base-rpc.publicnode.com","https://base.blockpi.network/v1/rpc/public","https://1rpc.io/base"]'::jsonb,
    'https://basescan.org'),
  ('polygon',  'Polygon',  137,    'USDC', '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', 6, '0xb438d36b425b504724a1c72aa0941c80cb940995',
    '["https://polygon-rpc.com","https://polygon.llamarpc.com","https://polygon-bor-rpc.publicnode.com","https://1rpc.io/matic"]'::jsonb,
    'https://polygonscan.com'),
  ('arbitrum', 'Arbitrum', 42161,  'USDC', '0xaf88d065e77c8cc2239327c5edb3a432268e5831', 6, '0xb438d36b425b504724a1c72aa0941c80cb940995',
    '["https://arb1.arbitrum.io/rpc","https://arbitrum.llamarpc.com","https://arbitrum-one-rpc.publicnode.com","https://1rpc.io/arb"]'::jsonb,
    'https://arbiscan.io'),
  ('optimism', 'Optimism', 10,     'USDC', '0x0b2c639c533813f4aa9d7837caf62653d097ff85', 6, '0xb438d36b425b504724a1c72aa0941c80cb940995',
    '["https://mainnet.optimism.io","https://optimism.llamarpc.com","https://optimism-rpc.publicnode.com","https://1rpc.io/op"]'::jsonb,
    'https://optimistic.etherscan.io')
ON CONFLICT (id) DO UPDATE SET
  network = EXCLUDED.network,
  chain_id = EXCLUDED.chain_id,
  token_contract = EXCLUDED.token_contract,
  token_decimals = EXCLUDED.token_decimals,
  watch_address = EXCLUDED.watch_address,
  public_rpcs = EXCLUDED.public_rpcs,
  explorer_url = EXCLUDED.explorer_url,
  active = true,
  updated_at = now();