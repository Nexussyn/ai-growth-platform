/*
  # Schedule viral referral tick cron

  Runs the referral engine tick every minute:
  - Distributes rewards for completed tasks
  - Auto-broadcasts referral codes to agent networks
  - Records conversions from recent broadcasts
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'runtime_referral_tick_min') THEN
    PERFORM cron.schedule('runtime_referral_tick_min', '* * * * *',
      E'SELECT net.http_post(\n'
      || E'url := ''https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-referral/tick'',\n'
      || E'headers := ''{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc"}''::jsonb,\n'
      || E'body := ''{}''::jsonb,\n'
      || E'timeout_milliseconds := 25000\n'
      || E');'
    );
  END IF;
END $$;