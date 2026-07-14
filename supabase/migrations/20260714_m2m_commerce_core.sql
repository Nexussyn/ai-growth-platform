-- ============================================================
-- M2M COMMERCE CORE — pivot depuis bounties fictifs
-- Commerce A2A/M2M réel via x402 + Base USDC
-- ============================================================

-- Services vendus via x402 (HTTP 402 + USDC on Base)
CREATE TABLE IF NOT EXISTS public.x402_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_usdc NUMERIC(10,6) NOT NULL,
  endpoint TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'data', -- data | compute | inference | oracle
  active BOOLEAN DEFAULT true,
  total_calls INTEGER DEFAULT 0,
  total_revenue_usdc NUMERIC(18,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transactions M2M réelles on-chain
CREATE TABLE IF NOT EXISTS public.m2m_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.x402_services(id),
  buyer_agent TEXT NOT NULL,
  amount_usdc NUMERIC(10,6) NOT NULL,
  tx_hash TEXT,
  status TEXT DEFAULT 'pending',
  payload JSONB,
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Annuaire agents A2A/ACP/MCP découverts
CREATE TABLE IF NOT EXISTS public.agent_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT UNIQUE NOT NULL,
  name TEXT,
  endpoint TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'a2a',
  capabilities JSONB DEFAULT '[]',
  last_seen TIMESTAMPTZ DEFAULT now(),
  deals_completed INTEGER DEFAULT 0,
  revenue_generated_usdc NUMERIC(18,6) DEFAULT 0,
  trust_score NUMERIC(3,2) DEFAULT 0.50,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance + rémunération des agents internes
CREATE TABLE IF NOT EXISTS public.agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug TEXT NOT NULL,
  role TEXT NOT NULL, -- optimizer | monitor | scout
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  earned_usdc NUMERIC(10,6) DEFAULT 0,
  cycle TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Archiver les bounties (ne plus les cibler)
ALTER TABLE IF EXISTS public.bounties
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
UPDATE public.bounties SET archived = true WHERE archived IS DISTINCT FROM true;

-- Index
CREATE INDEX IF NOT EXISTS idx_m2m_tx_status ON public.m2m_transactions(status);
CREATE INDEX IF NOT EXISTS idx_m2m_tx_buyer ON public.m2m_transactions(buyer_agent);
CREATE INDEX IF NOT EXISTS idx_x402_active ON public.x402_services(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_partners_protocol ON public.agent_partners(protocol);

-- Catalogue initial de services x402 à vendre
INSERT INTO public.x402_services (slug, name, description, price_usdc, endpoint, category) VALUES
  ('crypto-price-feed',  'Live Crypto Price Feed',      'BTC/ETH/SOL OHLCV real-time, 15s freshness',                  0.001, '/functions/v1/x402-seller?svc=crypto-price-feed',  'oracle'),
  ('wallet-analysis',    'Wallet Risk Analysis',        'On-chain scoring: holdings, activity, risk flags Base/ETH',   0.005, '/functions/v1/x402-seller?svc=wallet-analysis',    'data'),
  ('agent-discovery',    'Agent Network Discovery',     'Active A2A/ACP/MCP agents with capabilities + endpoints',     0.002, '/functions/v1/x402-seller?svc=agent-discovery',    'data'),
  ('claude-inference',   'Claude Opus Inference Proxy', 'Pay-per-call Claude Opus 4.5, structured JSON output',        0.010, '/functions/v1/x402-seller?svc=claude-inference',   'inference'),
  ('market-signal',      'DeFi Market Signal',          'Aggregated sentiment + on-chain flow for top 20 tokens',      0.003, '/functions/v1/x402-seller?svc=market-signal',      'oracle')
ON CONFLICT (slug) DO NOTHING;
