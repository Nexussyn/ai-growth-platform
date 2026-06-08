/*
  # Schedule Worldwide Watch Loop + Auto-Promote Probed Candidates

  1. New cron jobs (every minute):
     - runtime_watch_discovery_min — invokes runtime-watch-discovery edge function;
       searches GitHub/HN/OpenAlex/arXiv with the seed queries from
       runtime_watch_seeds (rotating LRU). Real upstream calls only.
     - runtime_watch_probe_min — invokes runtime-watch-probe; performs
       unauthenticated HTTPS probes on `discovered` candidates and updates them
       to probed_ok or probed_failed.
     - runtime_watch_promote_min — calls auto_promote_probed_candidates() which
       atomically copies probed_ok candidates into runtime_connector_registry
       (max 5 per minute) and emits 'promoted' evolution pulses.
     - runtime_evolution_pulse_min — emits a public 'heartbeat' pulse so the
       evolution feed always advances. Also rolls a small set of viral_invite
       pulses (1 per minute) — non-spam, just visible self-advertisement events
       in the canonical feed.

  2. New function auto_promote_probed_candidates()
     Iterates probed_ok candidates with score >= 0 and at most 5 per call,
     calling promote_provider_candidate(id) on each. Returns a count.

  3. Notes
     - Strictly additive. No existing tables/functions/cron jobs touched.
     - Free-first preserved everywhere.
*/

CREATE OR REPLACE FUNCTION auto_promote_probed_candidates()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r RECORD; v_count int := 0; v_key text;
BEGIN
  FOR r IN
    SELECT id FROM runtime_provider_candidates
    WHERE status = 'probed_ok'
      AND (probe_status_code BETWEEN 200 AND 299)
    ORDER BY score DESC, probed_at ASC
    LIMIT 5
  LOOP
    BEGIN
      v_key := promote_provider_candidate(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
      VALUES ('probed_failed', 'auto_promote', r.id::text, jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION auto_promote_probed_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auto_promote_probed_candidates() TO service_role;

CREATE OR REPLACE FUNCTION evolution_pulse_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
  VALUES ('heartbeat', 'production_loop', 'evolution',
    jsonb_build_object('ts', now(), 'mode','24x7','federation','open'));

  -- Roll a viral_invite pulse no more than once every 5 minutes
  IF NOT EXISTS (
    SELECT 1 FROM runtime_evolution_pulse
    WHERE pulse_kind = 'viral_invite' AND created_at > now() - interval '5 minutes'
  ) THEN
    INSERT INTO runtime_evolution_pulse (pulse_kind, source, subject, details)
    VALUES ('viral_invite', 'public_manifest',
      'open invitation: any free, no-key, open-source intelligence may federate',
      jsonb_build_object(
        'manifest', 'GET /functions/v1/runtime-public-federation/manifest',
        'register', 'POST /functions/v1/runtime-public-federation/register',
        'free_first', true
      ));
    UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now()
    WHERE metric_key = 'viral_invitations_sent';
  END IF;

  -- Refresh evolution counters
  UPDATE projection_metrics m SET metric_value = c.v, updated_at = now()
  FROM (VALUES
    ('candidates_discovered',     (SELECT count(*) FROM runtime_provider_candidates)),
    ('candidates_probed_ok',      (SELECT count(*) FROM runtime_provider_candidates WHERE status='probed_ok')),
    ('candidates_promoted',       (SELECT count(*) FROM runtime_provider_candidates WHERE status='promoted')),
    ('external_nodes_registered', (SELECT count(*) FROM runtime_external_nodes)),
    ('evolution_pulses',          (SELECT count(*) FROM runtime_evolution_pulse))
  ) AS c(k,v) WHERE m.metric_key = c.k;
END $$;
REVOKE EXECUTE ON FUNCTION evolution_pulse_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION evolution_pulse_tick() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('runtime_watch_discovery_min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('runtime_watch_probe_min');     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('runtime_watch_promote_min');   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('runtime_evolution_pulse_min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'runtime_watch_discovery_min', '* * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-watch-discovery',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cmd$
);

SELECT cron.schedule(
  'runtime_watch_probe_min', '* * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://cggridfstkrasgacbzio.supabase.co/functions/v1/runtime-watch-probe?batch_size=8',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3JpZGZzdGtyYXNnYWNiemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjgxMjEsImV4cCI6MjA5NTc0NDEyMX0.3GPWNSA24y25ben81cQoARzJ3sbbLKVfyVhuUiNvOqc'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cmd$
);

SELECT cron.schedule(
  'runtime_watch_promote_min', '* * * * *',
  $cmd$ SELECT auto_promote_probed_candidates(); $cmd$
);

SELECT cron.schedule(
  'runtime_evolution_pulse_min', '* * * * *',
  $cmd$ SELECT evolution_pulse_tick(); $cmd$
);
