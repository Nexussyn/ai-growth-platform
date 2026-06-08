/*
  # 24/7 Cron Wiring for Self-Healing Loop

  1. Schedules
    - `runtime_self_heal_min` — runs every minute, calls runtime-self-healer/cycle
    - `runtime_broker_dispatch_min` — runs every minute, calls runtime-broker/dispatch

  2. Notes
    - Uses pg_cron + pg_net to call edge functions via HTTP POST
    - Idempotent: drops any prior schedule with same name before creating
    - All requests authenticated with anon key
*/

DO $$
DECLARE
  v_url text := (SELECT current_setting('app.settings.supabase_url', true));
BEGIN
  -- pg_cron + pg_net should be enabled already; do nothing if not
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('runtime_self_heal_min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'runtime_self_heal_min');
    PERFORM cron.unschedule('runtime_broker_dispatch_min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'runtime_broker_dispatch_min');
  END IF;
END $$;

-- Schedule self-healer every minute
SELECT cron.schedule(
  'runtime_self_heal_min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-self-healer/cycle',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Schedule broker dispatch every minute
SELECT cron.schedule(
  'runtime_broker_dispatch_min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-broker/dispatch',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc'),
    body := '{"batch_size": 5}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
