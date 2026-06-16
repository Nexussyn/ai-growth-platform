-- =====================================================================
-- AI GROWTH v2 — Maillage mondial auto-extensible + veille + démarchage
-- =====================================================================
-- Schéma CŒUR pour 4 sous-systèmes (tous idempotents, non destructifs) :
--   A. Veille IA permanente        -> ai_radar_signals
--   B. Maillage de nœuds           -> mesh_nodes, mesh_provision_orders
--   C. Démarchage/contractualisation-> counterparties, outreach_messages, contracts
--   D. Canaux de revenu            -> affiliate_programs
--
-- RÈGLES RESPECTÉES :
--  * Réutilise le rail de paiement existant (onchain_payments -> on_payment_confirmed
--    -> record_gross_owner_split -> owner_settlement_ledger). AUCUN nouveau settlement.
--  * Convergence 75/25 immuable inchangée. Wallet jamais en dur.
--  * RLS service_role-only sur les nouvelles tables internes.
--  * immutable_config : ajoute SEULEMENT des clés de pilotage du maillage (bornes),
--    sans toucher aux clés de partage/wallet.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. VEILLE IA PERMANENTE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_radar_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type     text NOT NULL DEFAULT 'opportunity',  -- practice|tech|business|opportunity
  title           text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  url             text,
  source          text NOT NULL DEFAULT 'claude',       -- claude|rss|api|manual
  relevance_score integer NOT NULL DEFAULT 0,           -- 0..100 (Claude)
  tags            jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at   timestamptz NOT NULL DEFAULT now(),
  -- Dédup : un même signal (titre normalisé) n'est inséré qu'une fois.
  dedup_key       text GENERATED ALWAYS AS (lower(regexp_replace(coalesce(title,''),'\s+',' ','g'))) STORED,
  CONSTRAINT ai_radar_signals_dedup_uq UNIQUE (dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_radar_score ON public.ai_radar_signals (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_radar_type  ON public.ai_radar_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_ai_radar_time  ON public.ai_radar_signals (discovered_at DESC);

-- ---------------------------------------------------------------------
-- B. MAILLAGE DE NŒUDS (toile d'araignée) + ordres de provisioning
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesh_nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type       text NOT NULL DEFAULT 'edge',         -- edge|vps|worker
  label           text NOT NULL DEFAULT '',
  region          text NOT NULL DEFAULT 'unknown',
  endpoint_url    text,
  fingerprint     text NOT NULL DEFAULT '',             -- identité stable du nœud
  status          text NOT NULL DEFAULT 'active',       -- active|idle|dead
  capabilities    jsonb NOT NULL DEFAULT '{}'::jsonb,
  capacity_score  integer NOT NULL DEFAULT 1,           -- capacité relative
  parent_node_id  uuid REFERENCES public.mesh_nodes(id) ON DELETE SET NULL,
  jobs_done       bigint NOT NULL DEFAULT 0,
  registered_at   timestamptz NOT NULL DEFAULT now(),
  last_heartbeat  timestamptz NOT NULL DEFAULT now(),
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Idempotence d'enregistrement : un endpoint+fingerprint = un seul nœud.
  CONSTRAINT mesh_nodes_identity_uq UNIQUE (endpoint_url, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_status ON public.mesh_nodes (status);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_hb     ON public.mesh_nodes (last_heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_type   ON public.mesh_nodes (node_type);

-- Ordres de provisioning produits par l'autoscaler (exécutés par owner/partenaires).
CREATE TABLE IF NOT EXISTS public.mesh_provision_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode            text NOT NULL DEFAULT 'edge',         -- edge|vps
  reason          text NOT NULL DEFAULT '',             -- ex: "queue_pressure"
  desired_nodes   integer NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'pending',      -- pending|claimed|fulfilled|cancelled
  install_manifest text,                                -- script bash idempotent (mode vps)
  budget_usd      numeric(18,6) NOT NULL DEFAULT 0,     -- budget 25% alloué
  created_at      timestamptz NOT NULL DEFAULT now(),
  fulfilled_at    timestamptz,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_provision_status ON public.mesh_provision_orders (status);

-- ---------------------------------------------------------------------
-- C. DÉMARCHAGE & CONTRACTUALISATION IA<->IA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counterparties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  kind            text NOT NULL DEFAULT 'ai_agent',     -- ai_agent|api_service|platform|affiliate_program|bounty_source
  url             text,
  contact         text,
  discovered_via  text NOT NULL DEFAULT 'radar',        -- radar|scout|manual
  status          text NOT NULL DEFAULT 'prospect',     -- prospect|engaged|contracted|rejected
  score           integer NOT NULL DEFAULT 0,
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  dedup_key       text GENERATED ALWAYS AS (lower(coalesce(url, name))) STORED,
  CONSTRAINT counterparties_dedup_uq UNIQUE (dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_counterparties_status ON public.counterparties (status);
CREATE INDEX IF NOT EXISTS idx_counterparties_kind   ON public.counterparties (kind);

CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id uuid REFERENCES public.counterparties(id) ON DELETE CASCADE,
  channel         text NOT NULL DEFAULT 'draft',        -- draft|email|webhook|api|form
  body            text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'drafted',      -- drafted|sent|delivered|responded|failed
  sent_at         timestamptz,
  response        text,
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_outreach_cp     ON public.outreach_messages (counterparty_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON public.outreach_messages (status);

CREATE TABLE IF NOT EXISTS public.contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id uuid REFERENCES public.counterparties(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'partner',      -- client|supplier|partner|worker
  channel         text NOT NULL DEFAULT 'agent_match',  -- agent_match|api_resale|affiliate|bounty
  terms           jsonb NOT NULL DEFAULT '{}'::jsonb,
  commission_bps  integer NOT NULL DEFAULT 0,           -- commission de mise en relation
  status          text NOT NULL DEFAULT 'draft',        -- draft|proposed|active|ended|rejected
  evidence_url    text,                                 -- preuve réelle de demande/activité
  created_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts (status);
CREATE INDEX IF NOT EXISTS idx_contracts_role   ON public.contracts (role);
CREATE INDEX IF NOT EXISTS idx_contracts_cp     ON public.contracts (counterparty_id);

-- ---------------------------------------------------------------------
-- D. CANAL AFFILIATION (programmes réels — revenu confirmé sur preuve seulement)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_programs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  url             text,
  network         text NOT NULL DEFAULT '',             -- ex: impact, partnerstack, direct
  payout_terms    text NOT NULL DEFAULT '',
  tracking_url    text,                                 -- lien de tracking réel
  status          text NOT NULL DEFAULT 'prospect',     -- prospect|joined|active|rejected
  confirmed_revenue_usd numeric(18,6) NOT NULL DEFAULT 0, -- alimenté UNIQUEMENT sur preuve
  created_at      timestamptz NOT NULL DEFAULT now(),
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key       text GENERATED ALWAYS AS (lower(coalesce(url, name))) STORED,
  CONSTRAINT affiliate_programs_dedup_uq UNIQUE (dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_status ON public.affiliate_programs (status);

-- ---------------------------------------------------------------------
-- RLS : service_role only sur les tables internes (lecture publique gérée
--       par les Edge Functions qui exposent des vues honnêtes et restreintes).
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_radar_signals','mesh_nodes','mesh_provision_orders',
    'counterparties','outreach_messages','contracts','affiliate_programs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- Politique unique service_role (idempotente).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname='service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- immutable_config : bornes de pilotage du maillage (NON destructif).
--   * mesh_autoscale_enabled : interrupteur global de l'auto-extension.
--   * mesh_max_nodes         : plafond dur de nœuds actifs (garde-fou).
--   * mesh_heartbeat_dead_sec: délai sans heartbeat avant 'dead'.
-- N'altère JAMAIS owner_revenue_share_bps / wallet / convergence rule.
-- ---------------------------------------------------------------------
INSERT INTO public.immutable_config (config_key, config_value) VALUES
  ('mesh_autoscale_enabled', 'true'),
  ('mesh_max_nodes',         '8'),
  ('mesh_heartbeat_dead_sec','180')
ON CONFLICT (config_key) DO NOTHING;

-- Enregistre le nœud CŒUR (l'origine de la toile) de façon idempotente.
INSERT INTO public.mesh_nodes (node_type, label, region, endpoint_url, fingerprint, status, capacity_score, capabilities, meta)
VALUES (
  'edge', 'core-origin', 'supabase-edge',
  'https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/runtime-mesh-coordinator',
  'core-origin',
  'active', 10,
  '{"radar":true,"dealmaker":true,"dispatch":true,"settlement":true}'::jsonb,
  '{"role":"origin"}'::jsonb
)
ON CONFLICT (endpoint_url, fingerprint) DO NOTHING;
