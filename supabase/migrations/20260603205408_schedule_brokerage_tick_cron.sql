/*
  # Schedule brokerage tick cron

  Dispatches runtime-brokerage/tick every minute to broker tasks and update positions.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'runtime_brokerage_tick_min') THEN
    PERFORM cron.schedule('runtime_brokerage_tick_min', '* * * * *',
      E'SELECT net.http_post(\n'
      || E'url := ''https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-brokerage/tick'',\n'
      || E'headers := ''{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc"}''::jsonb,\n'
      || E'body := ''{}''::jsonb,\n'
      || E'timeout_milliseconds := 25000\n'
      || E');'
    );
  END IF;
END $$;