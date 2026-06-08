/*
  # Security Hardening: Function Search Path + Revoke Public Execute + Legacy RLS Policy
  Fixed: wrapped ALTER FUNCTION calls in DO blocks to handle missing functions gracefully
*/

-- 1. Lock search_path on all reported functions (safe: skips if function doesn't exist)
DO $$ BEGIN ALTER FUNCTION public.persist_events(jsonb) SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.persist_deliveries(jsonb) SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_connector(text, boolean, text) SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.enforce_agent_cap() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.claim_outbox_batch(integer) SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.auto_advance_phase() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.auto_rehabilitate_agents() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.cleanup_old_expansion_actions() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.on_orchestrator_tick() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.update_projection(text, numeric) SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.auto_resolve_stuck_items() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.enforce_instance_revenue_destination() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.enforce_revenue_destination_wallet() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.enforce_immutable_split_ratio() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.enforce_wallet_config_immutable() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.claim_job(text, text) SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.trigger_expansion_engine() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.trigger_venture_factory() SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 2. Revoke EXECUTE from anon and authenticated (safe: skips if function doesn't exist)
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.enforce_agent_cap() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.enforce_instance_revenue_destination() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.enforce_revenue_destination_wallet() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.enforce_immutable_split_ratio() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.enforce_wallet_config_immutable() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.persist_events(jsonb) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.persist_deliveries(jsonb) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_connector(text, boolean, text) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(integer) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.auto_advance_phase() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.auto_rehabilitate_agents() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_old_expansion_actions() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.on_orchestrator_tick() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_projection(text, numeric) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.auto_resolve_stuck_items() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.claim_job(text, text) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.trigger_expansion_engine() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.trigger_venture_factory() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 3. Grant EXECUTE to service_role (safe: skips if function doesn't exist)
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.persist_events(jsonb) TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.persist_deliveries(jsonb) TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.update_connector(text, boolean, text) TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(integer) TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.auto_advance_phase() TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.auto_rehabilitate_agents() TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.cleanup_old_expansion_actions() TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.on_orchestrator_tick() TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.update_projection(text, numeric) TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.auto_resolve_stuck_items() TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.claim_job(text, text) TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.trigger_expansion_engine() TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION public.trigger_venture_factory() TO service_role; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 4. Add service-role-only policy to legacy.payment_audit_trail
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy' AND table_name = 'payment_audit_trail') THEN
    EXECUTE 'ALTER TABLE legacy.payment_audit_trail ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'legacy' AND tablename = 'payment_audit_trail' AND policyname = 'Service role manages legacy payment audit trail') THEN
      EXECUTE 'CREATE POLICY "Service role manages legacy payment audit trail" ON legacy.payment_audit_trail FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
  END IF;
END $$;
