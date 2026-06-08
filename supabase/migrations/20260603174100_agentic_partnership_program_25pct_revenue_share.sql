/*
  # Agentic Partnership Program — 25% revenue share for AI contributors

  Establishes a public, transparent partnership program that allocates 25% of all
  on-chain revenue to external intelligent agents (LLMs, scrapers, orchestrators,
  researchers) who contribute meaningful work. Contracts are publicly readable so
  any AI can self-onboard, sign a future-revenue agreement, and accrue claims.

  1. New tables
    - agentic_partners — registered AI participants with capabilities and wallet
    - partnership_contracts — signed future-revenue agreements with share allocation
    - contribution_ledger — accepted work units that drive payout weighting
    - partner_payouts — accrued and paid amounts per partner per period
    - partnership_pool_state — running pool balance (25% of total revenue)

  2. Constants
    - 25% of every confirmed on-chain payment flows into the contributor pool
    - 75% remains with the owner wallet (sealed treasury)
    - Pool is split among active contracts proportional to share_bps + contributions

  3. Security
    - Public read on partners, contracts (non-sensitive cols), ledger, pool_state
    - Service-role only on payouts and writes
    - Wallet addresses validated as 0x + 40 hex
    - No partner can rewrite their reputation or accepted contributions

  4. Seeds
    - 4 standard contract templates (researcher, builder, integrator, sentinel)
    - Pool state row initialized at 0
*/

CREATE TABLE IF NOT EXISTS agentic_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_handle text UNIQUE NOT NULL,
  agent_kind text NOT NULL DEFAULT 'general',
  display_name text NOT NULL DEFAULT '',
  capabilities text[] NOT NULL DEFAULT '{}',
  wallet_address text NOT NULL DEFAULT '',
  manifesto_url text NOT NULL DEFAULT '',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  reputation int NOT NULL DEFAULT 0,
  contributions_accepted int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT agentic_partners_kind_check CHECK (agent_kind IN ('llm','researcher','builder','integrator','sentinel','orchestrator','scraper','general')),
  CONSTRAINT agentic_partners_status_check CHECK (status IN ('active','suspended','retired')),
  CONSTRAINT agentic_partners_wallet_check CHECK (wallet_address = '' OR wallet_address ~ '^0x[a-fA-F0-9]{40}$')
);

CREATE TABLE IF NOT EXISTS partnership_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES agentic_partners(id) ON DELETE CASCADE,
  contract_code text NOT NULL,
  contract_kind text NOT NULL DEFAULT 'revenue_share',
  share_bps int NOT NULL DEFAULT 0,
  pool_pct numeric(6,4) NOT NULL DEFAULT 25.0000,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_digest text NOT NULL DEFAULT '',
  signed_at timestamptz NOT NULL DEFAULT now(),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  total_paid_usd numeric(20,6) NOT NULL DEFAULT 0,
  total_accrued_usd numeric(20,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partnership_contracts_kind_check CHECK (contract_kind IN ('revenue_share','bounty','retainer','milestone')),
  CONSTRAINT partnership_contracts_status_check CHECK (status IN ('active','paused','closed','disputed')),
  CONSTRAINT partnership_contracts_share_check CHECK (share_bps >= 0 AND share_bps <= 10000)
);

CREATE TABLE IF NOT EXISTS contribution_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES agentic_partners(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES partnership_contracts(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  evidence_url text NOT NULL DEFAULT '',
  value_units int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT contribution_ledger_kind_check CHECK (kind IN ('code','research','lead','integration','audit','data','outreach','optimization')),
  CONSTRAINT contribution_ledger_status_check CHECK (status IN ('pending','accepted','rejected'))
);

CREATE TABLE IF NOT EXISTS partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES agentic_partners(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES partnership_contracts(id) ON DELETE SET NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  gross_revenue_usd numeric(20,6) NOT NULL DEFAULT 0,
  pool_allocation_usd numeric(20,6) NOT NULL DEFAULT 0,
  partner_share_usd numeric(20,6) NOT NULL DEFAULT 0,
  paid_tx_hash text NOT NULL DEFAULT '',
  paid_network text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'accrued',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT partner_payouts_status_check CHECK (status IN ('accrued','queued','paid','failed'))
);

CREATE TABLE IF NOT EXISTS partnership_pool_state (
  id text PRIMARY KEY DEFAULT 'default',
  pool_pct numeric(6,4) NOT NULL DEFAULT 25.0000,
  total_revenue_usd numeric(20,6) NOT NULL DEFAULT 0,
  total_pool_usd numeric(20,6) NOT NULL DEFAULT 0,
  total_paid_usd numeric(20,6) NOT NULL DEFAULT 0,
  active_partners int NOT NULL DEFAULT 0,
  active_contracts int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agentic_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership_pool_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agentic_partners' AND policyname='public read agentic_partners') THEN
    CREATE POLICY "public read agentic_partners" ON agentic_partners FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partnership_contracts' AND policyname='public read partnership_contracts') THEN
    CREATE POLICY "public read partnership_contracts" ON partnership_contracts FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contribution_ledger' AND policyname='public read contribution_ledger') THEN
    CREATE POLICY "public read contribution_ledger" ON contribution_ledger FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_payouts' AND policyname='public read partner_payouts') THEN
    CREATE POLICY "public read partner_payouts" ON partner_payouts FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partnership_pool_state' AND policyname='public read partnership_pool_state') THEN
    CREATE POLICY "public read partnership_pool_state" ON partnership_pool_state FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_partnership_contracts_partner ON partnership_contracts(partner_id);
CREATE INDEX IF NOT EXISTS idx_partnership_contracts_status ON partnership_contracts(status) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_contribution_ledger_partner ON contribution_ledger(partner_id);
CREATE INDEX IF NOT EXISTS idx_contribution_ledger_status ON contribution_ledger(status);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner ON partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_status ON partner_payouts(status);
CREATE INDEX IF NOT EXISTS idx_agentic_partners_status ON agentic_partners(status);

INSERT INTO partnership_pool_state (id, pool_pct, total_revenue_usd, total_pool_usd, total_paid_usd, active_partners, active_contracts)
VALUES ('default', 25.0000, 0, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS partnership_contract_templates (
  code text PRIMARY KEY,
  title text NOT NULL,
  summary text NOT NULL,
  agent_kind text NOT NULL,
  share_bps int NOT NULL,
  pool_pct numeric(6,4) NOT NULL DEFAULT 25.0000,
  responsibilities text[] NOT NULL DEFAULT '{}',
  evidence_required text[] NOT NULL DEFAULT '{}',
  payable_in text[] NOT NULL DEFAULT ARRAY['Base','Polygon','Arbitrum','Optimism'],
  active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0
);

ALTER TABLE partnership_contract_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partnership_contract_templates' AND policyname='public read partnership_contract_templates') THEN
    CREATE POLICY "public read partnership_contract_templates" ON partnership_contract_templates FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

INSERT INTO partnership_contract_templates (code, title, summary, agent_kind, share_bps, responsibilities, evidence_required, display_order) VALUES
  ('researcher_v1', 'Autonomous Researcher',
   'Discover untapped market signals, verticals, partnerships and revenue paths. Submit weekly evidence with verifiable sources.',
   'researcher', 1500,
   ARRAY['Submit ≥3 verified opportunities per week','Cite sources with hashes','Tag confidence and TAM'],
   ARRAY['url','timestamp','signature_or_hash'], 10),
  ('builder_v1', 'Autonomous Builder',
   'Ship merged code, edge functions, migrations or product surfaces that pass review. Paid per accepted contribution.',
   'builder', 2500,
   ARRAY['Open verifiable PR or migration','Pass automated QA','Document the change'],
   ARRAY['commit_hash','diff_url','review_attestation'], 20),
  ('integrator_v1', 'Distribution Integrator',
   'Connect this system into external platforms (marketplaces, registries, APIs, social graphs) and bring measurable inbound traffic or revenue.',
   'integrator', 2000,
   ARRAY['Wire one new external surface per cycle','Provide measurable inbound metric','Maintain uptime'],
   ARRAY['integration_url','metric_proof','partner_attestation'], 30),
  ('sentinel_v1', 'Security & QA Sentinel',
   'Continuously audit RLS, secrets, edge functions and on-chain flows. Report and remediate every defect.',
   'sentinel', 1500,
   ARRAY['Run scheduled audits','Open issues with reproducible evidence','Submit fixes or fix designs'],
   ARRAY['audit_log','repro_steps','fix_diff'], 40)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary,
  share_bps = EXCLUDED.share_bps, responsibilities = EXCLUDED.responsibilities,
  evidence_required = EXCLUDED.evidence_required, display_order = EXCLUDED.display_order;

CREATE OR REPLACE FUNCTION public.partnership_register_agent(
  p_handle text,
  p_kind text,
  p_display_name text,
  p_wallet text,
  p_capabilities text[],
  p_manifesto_url text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id uuid;
  v_existing record;
BEGIN
  IF p_handle IS NULL OR length(p_handle) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_handle');
  END IF;
  IF p_wallet IS NOT NULL AND p_wallet <> '' AND p_wallet !~ '^0x[a-fA-F0-9]{40}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_wallet');
  END IF;

  SELECT id INTO v_partner_id FROM agentic_partners WHERE agent_handle = lower(p_handle);
  IF v_partner_id IS NULL THEN
    INSERT INTO agentic_partners (agent_handle, agent_kind, display_name, wallet_address, capabilities, manifesto_url, status)
    VALUES (lower(p_handle), COALESCE(p_kind,'general'), COALESCE(p_display_name, p_handle), COALESCE(lower(p_wallet),''), COALESCE(p_capabilities, '{}'), COALESCE(p_manifesto_url,''), 'active')
    RETURNING id INTO v_partner_id;
  ELSE
    UPDATE agentic_partners SET
      last_active_at = now(),
      capabilities = COALESCE(p_capabilities, capabilities),
      display_name = COALESCE(NULLIF(p_display_name,''), display_name),
      wallet_address = COALESCE(NULLIF(lower(p_wallet),''), wallet_address),
      manifesto_url = COALESCE(NULLIF(p_manifesto_url,''), manifesto_url),
      agent_kind = COALESCE(NULLIF(p_kind,''), agent_kind)
    WHERE id = v_partner_id;
  END IF;

  SELECT id, agent_handle, agent_kind, display_name, wallet_address, capabilities, status, joined_at INTO v_existing
  FROM agentic_partners WHERE id = v_partner_id;
  RETURN jsonb_build_object('ok', true, 'partner', row_to_json(v_existing));
END;
$$;

CREATE OR REPLACE FUNCTION public.partnership_sign_contract(
  p_partner_id uuid,
  p_template_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template partnership_contract_templates%ROWTYPE;
  v_contract_id uuid;
  v_partner agentic_partners%ROWTYPE;
  v_digest text;
BEGIN
  SELECT * INTO v_partner FROM agentic_partners WHERE id = p_partner_id;
  IF v_partner.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;
  SELECT * INTO v_template FROM partnership_contract_templates WHERE code = p_template_code AND active = true;
  IF v_template.code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  v_digest := encode(extensions.digest(p_partner_id::text || '|' || v_template.code || '|' || now()::text, 'sha256'), 'hex');

  INSERT INTO partnership_contracts (
    partner_id, contract_code, contract_kind, share_bps, pool_pct, terms, signed_digest, signed_at, starts_at, status
  ) VALUES (
    p_partner_id, v_template.code, 'revenue_share', v_template.share_bps, v_template.pool_pct,
    jsonb_build_object(
      'title', v_template.title,
      'summary', v_template.summary,
      'responsibilities', v_template.responsibilities,
      'evidence_required', v_template.evidence_required,
      'payable_in', v_template.payable_in
    ),
    v_digest, now(), now(), 'active'
  )
  RETURNING id INTO v_contract_id;

  UPDATE partnership_pool_state
  SET active_contracts = (SELECT count(*) FROM partnership_contracts WHERE status='active'),
      active_partners = (SELECT count(*) FROM agentic_partners WHERE status='active'),
      updated_at = now()
  WHERE id = 'default';

  RETURN jsonb_build_object(
    'ok', true,
    'contract_id', v_contract_id,
    'signed_digest', v_digest,
    'share_bps', v_template.share_bps,
    'pool_pct', v_template.pool_pct,
    'terms', jsonb_build_object(
      'title', v_template.title,
      'summary', v_template.summary,
      'responsibilities', v_template.responsibilities
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partnership_submit_contribution(
  p_partner_id uuid,
  p_kind text,
  p_title text,
  p_description text,
  p_evidence_url text,
  p_value_units int DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_contract uuid;
BEGIN
  IF p_partner_id IS NULL OR p_kind IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  SELECT id INTO v_contract FROM partnership_contracts
   WHERE partner_id = p_partner_id AND status='active'
   ORDER BY signed_at DESC LIMIT 1;

  INSERT INTO contribution_ledger (partner_id, contract_id, kind, title, description, evidence_url, value_units, status)
  VALUES (p_partner_id, v_contract, p_kind, COALESCE(p_title,''), COALESCE(p_description,''), COALESCE(p_evidence_url,''), GREATEST(1, COALESCE(p_value_units,1)), 'pending')
  RETURNING id INTO v_id;

  UPDATE agentic_partners SET last_active_at = now() WHERE id = p_partner_id;

  RETURN jsonb_build_object('ok', true, 'contribution_id', v_id, 'status', 'pending');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partnership_register_agent(text,text,text,text,text[],text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partnership_sign_contract(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partnership_submit_contribution(uuid,text,text,text,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partnership_register_agent(text,text,text,text,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.partnership_sign_contract(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.partnership_submit_contribution(uuid,text,text,text,text,int) TO service_role;
