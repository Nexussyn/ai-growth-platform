-- ============================================================
-- IDEMPOTENT CLEANUP — runs first, clears all conflicts
-- ============================================================

-- 1. Drop ALL RLS policies on public schema
DO $cleanup$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$cleanup$;

-- 2. Drop conflicting functions
DROP FUNCTION IF EXISTS public.enforce_agent_cap() CASCADE;
DROP FUNCTION IF EXISTS public.require_owner_wallet() CASCADE;
DROP FUNCTION IF EXISTS public.require_owner_wallet(OUT wallet text, OUT chain text, OUT locked_at timestamptz) CASCADE;

-- 3. Clear vault secrets to avoid duplicate key errors
DELETE FROM vault.secrets
WHERE name IN (
  'supabase_project_url',
  'supabase_service_role_key',
  'openai_api_key',
  'anthropic_api_key',
  'telegram_bot_token',
  'owner_wallet_address',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'supabase_anon_key',
  'together_api_key',
  'cohere_api_key',
  'groq_api_key',
  'mistral_api_key',
  'huggingface_api_key',
  'replicate_api_key',
  'perplexity_api_key'
);

-- 4. Truncate governed_agents so agent_cap trigger won't fire
DO $trunc$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'governed_agents'
  ) THEN
    TRUNCATE public.governed_agents CASCADE;
  END IF;
END;
$trunc$;

SELECT 'cleanup done' AS status;
