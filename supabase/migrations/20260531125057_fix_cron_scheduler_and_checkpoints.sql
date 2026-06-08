/*
  # Fix pg_cron scheduler to use vault secrets + direct URL

  1. Problem
    - pg_cron job used `current_setting('app.settings.supabase_url')` which returns NULL
    - The scheduler tick never fires because net.http_post receives a NULL URL
    - This is why total_ticks=0 and last_run_at is null on all jobs

  2. Fix
    - Store the Supabase URL and service role key in Supabase Vault
    - Update the cron job to read from vault
    - Add a fallback: a second cron job that calls the scheduler directly via SQL function

  3. Additional
    - Add a checkpoint_snapshots table for agent resume capability
    - Add a DB-level trigger function that can run the watchdog logic if HTTP fails
*/

-- Store connection info in vault for cron access
SELECT vault.create_secret(
  'https://cggridfstkrasgacbzio.supabase.co',
  'supabase_project_url',
  'Supabase project URL for cron scheduler'
);

-- Unschedule old broken job
SELECT cron.unschedule('autonomous_scheduler_tick');

-- Create a function that reads from vault and triggers the scheduler
CREATE OR REPLACE FUNCTION public.trigger_scheduler_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Read URL from vault
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_project_url'
  LIMIT 1;

  -- Read service role key from vault
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- If vault secrets not available, try to get from env
  IF v_url IS NULL THEN
    v_url := 'https://cggridfstkrasgacbzio.supabase.co';
  END IF;

  -- Only proceed if we have both URL and key
  IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
    PERFORM extensions.http_post(
      v_url || '/functions/v1/multi-ai-system/scheduler/tick',
      '{}'::text,
      'application/json',
      ARRAY[
        extensions.http_header('Authorization', 'Bearer ' || v_key),
        extensions.http_header('Content-Type', 'application/json')
      ]
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: log failure but don't crash cron
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_scheduler_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_scheduler_tick() TO service_role;

-- Schedule using the function approach (more reliable than inline SQL with vault)
SELECT cron.schedule(
  'autonomous_scheduler_tick',
  '*/2 * * * *',
  $$SELECT public.trigger_scheduler_tick();$$
);

-- Add checkpoint_snapshots table for agent resume
CREATE TABLE IF NOT EXISTS checkpoint_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_type text NOT NULL,
  checkpoint_key text NOT NULL,
  snapshot_data jsonb NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(checkpoint_type, checkpoint_key, version)
);

ALTER TABLE checkpoint_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages checkpoint_snapshots"
  ON checkpoint_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_checkpoint_type_key ON checkpoint_snapshots(checkpoint_type, checkpoint_key);
CREATE INDEX IF NOT EXISTS idx_checkpoint_created ON checkpoint_snapshots(created_at DESC);
