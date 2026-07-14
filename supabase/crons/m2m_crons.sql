-- CRONS M2M COMMERCE — remplacent les anciens crons bounty/autonome
-- À appliquer après restauration du projet

-- Agent Optimizer : toutes les heures
SELECT cron.schedule(
  'agent-optimizer-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/agent-optimizer',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );$$
);

-- Agent Scout : toutes les 30 min
SELECT cron.schedule(
  'agent-scout-30min',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/agent-scout',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );$$
);

-- Agent Monitor : toutes les 15 min
SELECT cron.schedule(
  'agent-monitor-15min',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/agent-monitor',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );$$
);
