/*
  # Enable pg_cron and create autonomous scheduler trigger

  1. Extensions
    - Enable `pg_cron` for scheduled job execution
    - Enable `pg_net` for HTTP calls from within PostgreSQL

  2. Cron Jobs
    - `autonomous_scheduler_tick` - calls the edge function scheduler/tick endpoint every 2 minutes
    - This is the heartbeat that drives all autonomous execution

  3. Helper Functions
    - `append_orchestrator_transition` - appends a transition to the orchestrator state log
    - `increment_variant_impressions` - atomic increment for variant impressions

  4. Notes
    - pg_cron runs inside Postgres, calling the edge function via pg_net
    - The edge function handles all job scheduling logic internally
    - If the edge function is down, jobs simply don't execute (watchdog detects this)
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the cron job that triggers all autonomous execution
SELECT cron.schedule(
  'autonomous_scheduler_tick',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/multi-ai-system/scheduler/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Helper: append transition to orchestrator state
CREATE OR REPLACE FUNCTION append_orchestrator_transition(p_transition jsonb)
RETURNS void AS $$
BEGIN
  UPDATE orchestrator_state
  SET transitions_log = array_append(transitions_log, p_transition),
      updated_at = now()
  WHERE id = 'singleton';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: atomic increment for variant impressions
CREATE OR REPLACE FUNCTION increment_variant_impressions(p_key text)
RETURNS void AS $$
BEGIN
  UPDATE experiment_variants
  SET impressions = impressions + 1
  WHERE variant_key = p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: increment system metrics atomically
CREATE OR REPLACE FUNCTION increment_system_metrics(p_gross numeric, p_payout numeric, p_reserve numeric)
RETURNS void AS $$
BEGIN
  INSERT INTO system_metrics (id, paid_calls, total_gross_usdc, total_payout_usdc, total_reserve_usdc, last_payment_at, updated_at)
  VALUES ('singleton', 1, p_gross, p_payout, p_reserve, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    paid_calls = system_metrics.paid_calls + 1,
    total_gross_usdc = system_metrics.total_gross_usdc + p_gross,
    total_payout_usdc = system_metrics.total_payout_usdc + p_payout,
    total_reserve_usdc = system_metrics.total_reserve_usdc + p_reserve,
    last_payment_at = now(),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
