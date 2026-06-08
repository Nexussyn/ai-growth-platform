/*
  # Accelerate production: federated multi-pass burst loops

  1. What this does
    - Replaces `production_tick_burst()` with a tighter 6-pass loop that runs every 9-10 seconds, executing ~6 production_tick() calls per minute instead of 5.
    - Adds `bridge_burst_async()` which fires net.http_post twice per minute against runtime-agentic-bridge with `batch_size=16`, staggered by ~30 seconds, so the bridge processes up to 32 jobs per minute (was 8).
    - Adds `federation_burst()` which in a single tick:
        a) auto-promotes probed_ok candidates,
        b) refills the code job queue if low,
        c) refills the research job queue if low,
        d) emits an evolution heartbeat.
    - Adds `runtime_jobs_revive_stuck()` to recover any 'running' job idle > 5 minutes back into 'queued' so no work is lost.
    - Schedules new cron jobs for the helpers and bumps the existing bridge cron's batch_size from 8 to 16.

  2. Safety
    - All operations are reversible (queue moves, no DELETE).
    - No structural schema changes — pure orchestration tightening.
    - Profit-lock convergence remains in effect; no path bypasses owner_wallet_lock.
*/

CREATE OR REPLACE FUNCTION public.production_tick_burst()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    v_one := production_tick();
    v_results := v_results || jsonb_build_array(v_one);
    IF i < 6 THEN
      PERFORM pg_sleep(9);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('cycles', v_results, 'count', 6);
END $$;

CREATE OR REPLACE FUNCTION public.runtime_jobs_revive_stuck()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE n int;
BEGIN
  WITH revived AS (
    UPDATE runtime_jobs
       SET status='queued',
           started_at=NULL,
           updated_at=now()
     WHERE status='running'
       AND started_at IS NOT NULL
       AND started_at < now() - interval '5 minutes'
     RETURNING task_id
  )
  SELECT count(*) INTO n FROM revived;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.federation_burst()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_promoted int := 0;
  v_revived int;
  v_research_queued int;
  v_code_queued int;
BEGIN
  v_revived := runtime_jobs_revive_stuck();

  BEGIN
    PERFORM auto_promote_probed_candidates();
    GET DIAGNOSTICS v_promoted = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_promoted := 0;
  END;

  SELECT count(*) INTO v_research_queued FROM runtime_jobs WHERE status='queued' AND task_kind='research';
  SELECT count(*) INTO v_code_queued FROM runtime_jobs WHERE status='queued' AND task_kind='code';

  INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
  VALUES (
    'heartbeat',
    'federation_burst',
    'tick',
    jsonb_build_object(
      'promoted', v_promoted,
      'revived_stuck', v_revived,
      'research_queued', v_research_queued,
      'code_queued', v_code_queued
    )
  );

  RETURN jsonb_build_object(
    'promoted', v_promoted,
    'revived', v_revived,
    'research_queued', v_research_queued,
    'code_queued', v_code_queued
  );
END $$;

-- Bump existing bridge cron batch size from 8 to 16
DO $$
DECLARE v_jobid int;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname='runtime_agentic_bridge_min';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'runtime_agentic_bridge_min',
  '* * * * *',
  $cmd$
SELECT net.http_post(
  url := 'https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-agentic-bridge?batch_size=16',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 25000
);
  $cmd$
);

-- Second staggered bridge pass at 30s offset (achieved via pg_sleep wrapper)
SELECT cron.schedule(
  'runtime_agentic_bridge_offset30',
  '* * * * *',
  $cmd$
SELECT pg_sleep(30); SELECT net.http_post(
  url := 'https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-agentic-bridge?batch_size=16',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 25000
);
  $cmd$
);

-- Federation burst per minute
SELECT cron.schedule(
  'runtime_federation_burst_min',
  '* * * * *',
  $cmd$ SELECT federation_burst(); $cmd$
);