-- ============================================================================
-- Migration : Split BRUT 75/25 immuable sur chaque paiement USDC entrant
-- ----------------------------------------------------------------------------
-- Règle du propriétaire (immuable) :
--   À CHAQUE paiement USDC confirmé on-chain, le BRUT entrant est réparti :
--     - 75% -> wallet du propriétaire (settlement, convergence EXCLUSIVE)
--     - 25% -> autofinancement de la plateforme
--   Aucune déduction de coûts avant le split (split sur le brut, décision owner).
--   Les bps (7500 / 2500) et le wallet sont lus depuis immutable_config :
--   jamais codés en dur. Toute tentative de falsification du ratio est
--   corrigée automatiquement et journalisée dans governance_events.
--
-- Ne casse PAS enforce_immutable_split_ratio() (déjà conforme, couche payout).
-- Conserve la logique métier existante de on_payment_confirmed (publication
-- de tâche bounty si un client_task_orders est matché).
-- Idempotence stricte sur tx_hash partout.
-- ============================================================================

-- 1) Table de settlement dédiée : trace chaque répartition 75/25 du brut
CREATE TABLE IF NOT EXISTS public.owner_settlement_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash       text NOT NULL,
  network       text,
  asset         text DEFAULT 'USDC',
  gross_usdc    numeric NOT NULL,
  owner_usdc    numeric NOT NULL,   -- 75% destiné EXCLUSIVEMENT au wallet propriétaire
  platform_usdc numeric NOT NULL,   -- 25% autofinancement plateforme
  owner_wallet  text NOT NULL,      -- résolu depuis immutable_config (jamais en dur)
  owner_bps     integer NOT NULL,   -- 7500 attendu
  platform_bps  integer NOT NULL,   -- 2500 attendu
  status        text NOT NULL DEFAULT 'pending_payout', -- pending_payout | paid | failed
  payout_tx_hash text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz,
  CONSTRAINT owner_settlement_ledger_tx_unique UNIQUE (tx_hash)
);

COMMENT ON TABLE public.owner_settlement_ledger IS
  'Répartition immuable 75/25 du brut de chaque paiement USDC entrant. 75% dû au wallet propriétaire (convergence exclusive), 25% autofinancement. Idempotent par tx_hash.';

CREATE INDEX IF NOT EXISTS idx_owner_settlement_status ON public.owner_settlement_ledger (status);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_network ON public.owner_settlement_ledger (network);

-- 2) Résolveur des bps depuis immutable_config (fallback 7500/2500)
CREATE OR REPLACE FUNCTION public.get_owner_split_bps()
RETURNS TABLE(owner_bps integer, platform_bps integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner integer;
  v_plat  integer;
BEGIN
  SELECT NULLIF(config_value,'')::integer INTO v_owner
  FROM immutable_config WHERE config_key = 'owner_revenue_share_bps';
  SELECT NULLIF(config_value,'')::integer INTO v_plat
  FROM immutable_config WHERE config_key = 'platform_self_finance_share_bps';

  -- Fallback immuable si config absente
  IF v_owner IS NULL THEN v_owner := 7500; END IF;
  IF v_plat  IS NULL THEN v_plat  := 2500; END IF;

  -- Garde-fou : la somme doit valoir 10000 bps ; sinon on force 7500/2500
  IF (v_owner + v_plat) <> 10000 THEN
    v_owner := 7500;
    v_plat  := 2500;
  END IF;

  RETURN QUERY SELECT v_owner, v_plat;
END;
$function$;

-- 3) Résolveur du wallet propriétaire canonique depuis immutable_config
CREATE OR REPLACE FUNCTION public.get_owner_settlement_wallet()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT lower(config_value)
  FROM immutable_config
  WHERE config_key = 'owner_settlement_wallet'
  LIMIT 1;
$function$;

-- 4) Fonction centrale : enregistre le split BRUT 75/25 (idempotente par tx_hash)
CREATE OR REPLACE FUNCTION public.record_gross_owner_split(
  p_tx_hash    text,
  p_gross_usdc numeric,
  p_network    text DEFAULT NULL,
  p_asset      text DEFAULT 'USDC'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner_bps integer;
  v_plat_bps  integer;
  v_owner_usdc numeric;
  v_plat_usdc  numeric;
  v_wallet text;
  v_id uuid;
BEGIN
  -- Idempotence : si déjà settlé, retourner l'existant sans rien dupliquer
  SELECT id INTO v_id FROM owner_settlement_ledger WHERE tx_hash = p_tx_hash;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF p_gross_usdc IS NULL OR p_gross_usdc <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT owner_bps, platform_bps INTO v_owner_bps, v_plat_bps FROM get_owner_split_bps();
  v_wallet := get_owner_settlement_wallet();

  v_owner_usdc := ROUND(p_gross_usdc * v_owner_bps / 10000.0, 6);
  v_plat_usdc  := p_gross_usdc - v_owner_usdc;  -- le reste, garantit somme exacte

  INSERT INTO owner_settlement_ledger
    (tx_hash, network, asset, gross_usdc, owner_usdc, platform_usdc,
     owner_wallet, owner_bps, platform_bps, status)
  VALUES
    (p_tx_hash, p_network, COALESCE(p_asset,'USDC'), p_gross_usdc,
     v_owner_usdc, v_plat_usdc, v_wallet, v_owner_bps, v_plat_bps, 'pending_payout')
  RETURNING id INTO v_id;

  -- Alimenter le pool d'autofinancement avec la part 25% (réel, traçable)
  UPDATE partnership_pool_state
  SET total_pool_usd = total_pool_usd + v_plat_usdc,
      updated_at = now()
  WHERE id = 'default';

  RETURN v_id;
END;
$function$;

-- 5) Garde-fou IMMUABLE : tout INSERT/UPDATE sur owner_settlement_ledger doit
--    respecter owner_usdc/gross = bps owner. Sinon correction auto + journalisation.
CREATE OR REPLACE FUNCTION public.enforce_gross_owner_split()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner_bps integer;
  v_plat_bps  integer;
  v_expected_owner numeric;
  v_ratio numeric;
BEGIN
  SELECT owner_bps, platform_bps INTO v_owner_bps, v_plat_bps FROM get_owner_split_bps();

  IF NEW.gross_usdc IS NULL OR NEW.gross_usdc <= 0 THEN
    RETURN NEW;
  END IF;

  v_expected_owner := ROUND(NEW.gross_usdc * v_owner_bps / 10000.0, 6);
  v_ratio := NEW.owner_usdc / NEW.gross_usdc;

  -- Tolérance d'arrondi 1e-6 sur le ratio
  IF ABS(v_ratio - (v_owner_bps / 10000.0)) > 0.000001 THEN
    INSERT INTO governance_events (action_type, actor_type, actor_id, status, reason, payload, created_at)
    VALUES (
      'gross_split_tamper_blocked',
      'db_trigger',
      'owner_settlement_ledger',
      'critical',
      'Tentative de falsification du ratio 75/25 corrigée automatiquement',
      jsonb_build_object(
        'tx_hash', NEW.tx_hash,
        'attempted_owner_usdc', NEW.owner_usdc,
        'enforced_owner_usdc', v_expected_owner,
        'gross_usdc', NEW.gross_usdc,
        'owner_bps', v_owner_bps
      ),
      now()
    );
    -- Correction automatique : on force le ratio immuable
    NEW.owner_usdc    := v_expected_owner;
    NEW.platform_usdc := NEW.gross_usdc - v_expected_owner;
    NEW.owner_bps     := v_owner_bps;
    NEW.platform_bps  := v_plat_bps;
  END IF;

  -- Forcer toujours le wallet canonique (convergence exclusive)
  NEW.owner_wallet := get_owner_settlement_wallet();

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_gross_owner_split ON public.owner_settlement_ledger;
CREATE TRIGGER trg_enforce_gross_owner_split
  BEFORE INSERT OR UPDATE ON public.owner_settlement_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gross_owner_split();

-- 6) Refonte de on_payment_confirmed : split BRUT 75/25 dans TOUS les cas
--    (matched + unmatched), tout en conservant la logique métier existante.
CREATE OR REPLACE FUNCTION public.on_payment_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order client_task_orders%ROWTYPE;
  v_task_id uuid;
BEGIN
  -- (0) IMMUABLE : enregistrer le split BRUT 75/25 du paiement entrant.
  --     S'exécute toujours, idempotent par tx_hash, AVANT toute logique métier.
  PERFORM public.record_gross_owner_split(
    NEW.tx_hash,
    NEW.amount_usd,
    NEW.network,
    'USDC'
  );

  -- (1) Logique métier conservée : matcher un order client en attente de paiement
  SELECT * INTO v_order
  FROM client_task_orders
  WHERE status = 'pending_payment'
    AND ABS(amount_usdc - NEW.amount_usd) < 0.01
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order.id IS NULL THEN
    -- Paiement non associé : déjà splitté ci-dessus. Trace dans platform_revenue
    -- la part d'autofinancement réelle (25%), sans dupliquer le brut.
    INSERT INTO platform_revenue (source, amount_usdc, description)
    SELECT 'unmatched_payment_selffinance', platform_usdc,
           format('Unmatched payment %s USDC tx %s — 75%% owner / 25%% self-finance',
                  NEW.amount_usd, NEW.tx_hash)
    FROM owner_settlement_ledger WHERE tx_hash = NEW.tx_hash;
    RETURN NEW;
  END IF;

  -- (2) Order matché : publier la tâche bounty (logique métier conservée)
  INSERT INTO bounty_tasks (title, scope, files, expected_output, acceptance_criteria, reward_usdc, deadline, status, priority)
  VALUES (
    v_order.task_title,
    v_order.task_scope,
    ARRAY[]::text[],
    v_order.expected_output,
    'Result must match expected_output format. Client has paid in advance.',
    v_order.agent_reward_usdc,
    now() + interval '7 days',
    'open',
    20
  ) RETURNING id INTO v_task_id;

  UPDATE client_task_orders SET
    status = 'task_published',
    tx_hash = NEW.tx_hash,
    bounty_task_id = v_task_id,
    confirmed_at = now()
  WHERE id = v_order.id;

  -- Trace la part d'autofinancement réelle (25% du brut) liée à la tâche
  INSERT INTO platform_revenue (source, amount_usdc, task_id, description)
  SELECT 'client_task_deposit_selffinance', platform_usdc, v_task_id,
    format('Client paid %s USDC tx %s — 75%% owner / 25%% self-finance for task: %s',
      NEW.amount_usd, NEW.tx_hash, v_order.task_title)
  FROM owner_settlement_ledger WHERE tx_hash = NEW.tx_hash;

  INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
  VALUES ('task_claimed', 'payment_gateway', v_order.client_email,
    jsonb_build_object(
      'order_id', v_order.id, 'task_id', v_task_id,
      'amount_usdc', v_order.amount_usdc,
      'tx_hash', NEW.tx_hash,
      'split', '75_owner_25_selffinance'
    ));

  RETURN NEW;
END;
$function$;

-- 7) Vue de vérification du settlement propriétaire
CREATE OR REPLACE VIEW public.v_owner_settlement_summary AS
SELECT
  COALESCE(network, 'all')                         AS network,
  asset,
  count(*)                                         AS payments,
  COALESCE(SUM(gross_usdc), 0)                     AS total_gross_usdc,
  COALESCE(SUM(owner_usdc), 0)                     AS total_owner_due_usdc,   -- 75%
  COALESCE(SUM(platform_usdc), 0)                  AS total_selffinance_usdc, -- 25%
  COALESCE(SUM(owner_usdc) FILTER (WHERE status='paid'), 0)           AS owner_paid_usdc,
  COALESCE(SUM(owner_usdc) FILTER (WHERE status='pending_payout'), 0) AS owner_pending_usdc
FROM public.owner_settlement_ledger
GROUP BY ROLLUP(network), asset;

COMMENT ON VIEW public.v_owner_settlement_summary IS
  'Synthèse du settlement : brut reçu, 75% dû au propriétaire (payé vs en attente), 25% autofinancement, par réseau/asset.';
