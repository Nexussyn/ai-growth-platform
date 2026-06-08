/*
  # Full Security Remediation Pass

  1. Function Hardening
    - Recreate all SECURITY DEFINER functions with explicit SET search_path = ''
    - Use fully qualified public.table_name in all function bodies
    - REVOKE EXECUTE from PUBLIC, anon, and authenticated on all functions
    - GRANT EXECUTE only to service_role

  2. Policy Remediation
    - Remove overly permissive anon SELECT policies on sensitive tables
    - Remove legacy {public} role policies that check auth.role()
    - Replace with proper service_role-only policies
    - Remove "USING (true)" from tables that should not be publicly readable
    - Keep limited anon read access ONLY for dashboard display tables (via edge fn proxy)

  3. Principle Applied
    - All data access goes through the edge function (service_role)
    - The frontend client uses anon key but reads ONLY through edge function endpoints
    - No direct table reads from anon/authenticated except system_metrics (read-only, non-sensitive)
    - Functions are service_role-only execution

  4. Tables affected:
    - agent_status: remove public SELECT
    - api_calls: remove permissive authenticated SELECT
    - payment_ledger: remove anon SELECT (sensitive)
    - wallet_config: remove public SELECT (go through edge fn)
    - agent_decisions, agent_runs, channel_performance, diversification_phases,
      experiment_variants, growth_phases, health_checks, improvement_*,
      last_known_good, reconciliation_status, referral_events, update_intelligence,
      viral_shares: remove anon SELECT (all data proxied via edge fn)
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. FUNCTION HARDENING
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop and recreate with hardened settings
DROP FUNCTION IF EXISTS public.append_orchestrator_transition(jsonb);
DROP FUNCTION IF EXISTS public.increment_system_metrics(numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.increment_variant_impressions(text);

-- Recreate: append_orchestrator_transition
CREATE OR REPLACE FUNCTION public.append_orchestrator_transition(p_transition jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.orchestrator_state
  SET transitions_log = array_append(transitions_log, p_transition),
      updated_at = now()
  WHERE id = 'singleton';
END;
$$;

-- Recreate: increment_system_metrics
CREATE OR REPLACE FUNCTION public.increment_system_metrics(p_gross numeric, p_payout numeric, p_reserve numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.system_metrics (id, paid_calls, total_gross_usdc, total_payout_usdc, total_reserve_usdc, last_payment_at, updated_at)
  VALUES ('singleton', 1, p_gross, p_payout, p_reserve, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    paid_calls = public.system_metrics.paid_calls + 1,
    total_gross_usdc = public.system_metrics.total_gross_usdc + p_gross,
    total_payout_usdc = public.system_metrics.total_payout_usdc + p_payout,
    total_reserve_usdc = public.system_metrics.total_reserve_usdc + p_reserve,
    last_payment_at = now(),
    updated_at = now();
END;
$$;

-- Recreate: increment_variant_impressions
CREATE OR REPLACE FUNCTION public.increment_variant_impressions(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.experiment_variants
  SET impressions = impressions + 1
  WHERE variant_key = p_key;
END;
$$;

-- Revoke all PUBLIC/anon/authenticated EXECUTE on these functions
REVOKE EXECUTE ON FUNCTION public.append_orchestrator_transition(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_system_metrics(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_variant_impressions(text) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE only to service_role
GRANT EXECUTE ON FUNCTION public.append_orchestrator_transition(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_system_metrics(numeric, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_variant_impressions(text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. REMOVE PERMISSIVE ANON/PUBLIC SELECT POLICIES ON SENSITIVE TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- agent_decisions: remove anon read (data proxied via edge fn)
DROP POLICY IF EXISTS "Anon can read agent_decisions" ON public.agent_decisions;

-- agent_runs: remove anon read (data proxied via edge fn)
DROP POLICY IF EXISTS "Anon can read agent_runs" ON public.agent_runs;

-- agent_status: remove public SELECT (data proxied via edge fn)
DROP POLICY IF EXISTS "Public can view agent status" ON public.agent_status;

-- api_calls: remove permissive authenticated SELECT with USING(true)
DROP POLICY IF EXISTS "Users can view own api calls" ON public.api_calls;

-- channel_performance: remove anon read
DROP POLICY IF EXISTS "Anon can read channel_performance" ON public.channel_performance;

-- diversification_phases: remove anon read
DROP POLICY IF EXISTS "Anon can read diversification_phases" ON public.diversification_phases;

-- experiment_variants: remove anon read
DROP POLICY IF EXISTS "Anon can read experiment_variants" ON public.experiment_variants;

-- growth_phases: remove anon read
DROP POLICY IF EXISTS "Anon can read growth_phases" ON public.growth_phases;

-- health_checks: remove anon read
DROP POLICY IF EXISTS "Anon can read health_checks" ON public.health_checks;

-- improvement_cycles: remove anon read
DROP POLICY IF EXISTS "Anon can read improvement_cycles" ON public.improvement_cycles;

-- improvement_memory: remove anon read
DROP POLICY IF EXISTS "Anon can read improvement_memory" ON public.improvement_memory;

-- improvement_proposals: remove anon read
DROP POLICY IF EXISTS "Anon can read improvement_proposals" ON public.improvement_proposals;

-- improvement_roadmap: remove anon read
DROP POLICY IF EXISTS "Anon can read improvement_roadmap" ON public.improvement_roadmap;

-- last_known_good: remove anon read
DROP POLICY IF EXISTS "Anon can read last_known_good" ON public.last_known_good;

-- payment_ledger: remove anon read (SENSITIVE — payment data)
DROP POLICY IF EXISTS "Anon can read payment_ledger summary" ON public.payment_ledger;

-- reconciliation_status: remove anon read
DROP POLICY IF EXISTS "Anon can read reconciliation_status" ON public.reconciliation_status;

-- referral_events: remove anon read
DROP POLICY IF EXISTS "Anon can read referral_events" ON public.referral_events;

-- update_intelligence: remove anon read
DROP POLICY IF EXISTS "Anon can read update_intelligence" ON public.update_intelligence;

-- viral_shares: remove anon read
DROP POLICY IF EXISTS "Anon can read viral_shares" ON public.viral_shares;

-- wallet_config: remove public SELECT with USING(true)
DROP POLICY IF EXISTS "wallet_config_public_select" ON public.wallet_config;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. REPLACE LEGACY PUBLIC ROLE POLICIES WITH SERVICE_ROLE-ONLY
-- ══════════════════════════════════════════════════════════════════════════════

-- api_calls: replace legacy public policies with service_role
DROP POLICY IF EXISTS "api_calls_service_role_delete" ON public.api_calls;
DROP POLICY IF EXISTS "api_calls_service_role_insert" ON public.api_calls;
DROP POLICY IF EXISTS "api_calls_service_role_select" ON public.api_calls;
DROP POLICY IF EXISTS "api_calls_service_role_update" ON public.api_calls;

CREATE POLICY "Service role manages api_calls"
  ON public.api_calls FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- payment_log: replace legacy public policies
DROP POLICY IF EXISTS "payment_log_service_role_delete" ON public.payment_log;
DROP POLICY IF EXISTS "payment_log_service_role_insert" ON public.payment_log;
DROP POLICY IF EXISTS "payment_log_service_role_select" ON public.payment_log;
DROP POLICY IF EXISTS "payment_log_service_role_update" ON public.payment_log;

CREATE POLICY "Service role manages payment_log"
  ON public.payment_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- payment_logs: replace legacy public policies
DROP POLICY IF EXISTS "payment_logs_service_role_insert" ON public.payment_logs;
DROP POLICY IF EXISTS "payment_logs_service_role_select" ON public.payment_logs;
DROP POLICY IF EXISTS "payment_logs_service_role_update" ON public.payment_logs;

CREATE POLICY "Service role manages payment_logs"
  ON public.payment_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- payment_transactions: replace legacy public policies
DROP POLICY IF EXISTS "payment_transactions_service_role_delete" ON public.payment_transactions;
DROP POLICY IF EXISTS "payment_transactions_service_role_insert" ON public.payment_transactions;
DROP POLICY IF EXISTS "payment_transactions_service_role_select" ON public.payment_transactions;
DROP POLICY IF EXISTS "payment_transactions_service_role_update" ON public.payment_transactions;

CREATE POLICY "Service role manages payment_transactions"
  ON public.payment_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- rate_limit_buckets: replace legacy public policies
DROP POLICY IF EXISTS "rate_limit_buckets_service_role_delete" ON public.rate_limit_buckets;
DROP POLICY IF EXISTS "rate_limit_buckets_service_role_insert" ON public.rate_limit_buckets;
DROP POLICY IF EXISTS "rate_limit_buckets_service_role_select" ON public.rate_limit_buckets;
DROP POLICY IF EXISTS "rate_limit_buckets_service_role_update" ON public.rate_limit_buckets;

CREATE POLICY "Service role manages rate_limit_buckets"
  ON public.rate_limit_buckets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- revenue_stream: replace legacy public policies
DROP POLICY IF EXISTS "revenue_stream_service_role_delete" ON public.revenue_stream;
DROP POLICY IF EXISTS "revenue_stream_service_role_insert" ON public.revenue_stream;
DROP POLICY IF EXISTS "revenue_stream_service_role_select" ON public.revenue_stream;
DROP POLICY IF EXISTS "revenue_stream_service_role_update" ON public.revenue_stream;

CREATE POLICY "Service role manages revenue_stream"
  ON public.revenue_stream FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- wallet_config: replace public policies with service_role
DROP POLICY IF EXISTS "wallet_config_service_role_delete" ON public.wallet_config;
DROP POLICY IF EXISTS "wallet_config_service_role_insert" ON public.wallet_config;
DROP POLICY IF EXISTS "wallet_config_service_role_update" ON public.wallet_config;

CREATE POLICY "Service role manages wallet_config"
  ON public.wallet_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. ADD SERVICE_ROLE-ONLY POLICIES WHERE MISSING
-- ══════════════════════════════════════════════════════════════════════════════

-- agent_status: add service_role policy (was only public SELECT before)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_status' AND policyname = 'Service role manages agent_status') THEN
    CREATE POLICY "Service role manages agent_status"
      ON public.agent_status FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- system_metrics: keep the limited anon/authenticated read (non-sensitive aggregate only)
-- This is the ONE table the client reads directly for the revenue counter
-- It only contains: paid_calls count, aggregate USDC totals, timestamps — no PII

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. REVOKE DEFAULT SCHEMA PRIVILEGES FROM PUBLIC
-- ══════════════════════════════════════════════════════════════════════════════

-- Revoke ability for anon to execute future functions created in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
