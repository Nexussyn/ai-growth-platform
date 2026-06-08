/*
  # Schedule on-chain USDC watcher every minute

  1. Why
    - The decentralized payment collector must continuously poll Base mainnet via free public RPC for USDC transfers to the sealed owner wallet.
    - Running every minute keeps payment-status latency under 60s without overloading public RPC endpoints (we already cap each scan at 800 blocks).

  2. Cron
    - Schedules `runtime-onchain-watcher` HTTP edge function once per minute with the project's anon JWT.
    - Idempotent via `IF NOT EXISTS` style (cron.schedule unique by name; we unschedule first if present).

  3. Reversibility
    - To pause collection: `SELECT cron.unschedule('runtime_onchain_watcher_min');` — reversible at any time, no on-chain side effects.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'runtime_onchain_watcher_min') THEN
    PERFORM cron.unschedule('runtime_onchain_watcher_min');
  END IF;
END $$;

SELECT cron.schedule(
  'runtime_onchain_watcher_min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-onchain-watcher',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 28000
  );
  $$
);