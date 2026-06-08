/*
  # Fix production_tick — evidence_required column is jsonb, not text[]

  Replaces the queue-fill INSERT to use a jsonb array for evidence_required,
  matching the existing runtime_jobs schema. No other behaviour changes.
*/

CREATE OR REPLACE FUNCTION production_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tick_id text := 'tick-' || to_char(clock_timestamp(),'YYYYMMDD-HH24MISSMS');
  v_stuck_count int := 0;
  v_routes_touched int := 0;
  v_remed_count int := 0;
  v_queue_filled int := 0;
  v_open_faults int := 0;
  v_fault_id uuid;
  v_attempts int;
BEGIN
  INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
  VALUES (v_tick_id, 'production_loop', 'heartbeat:tick',
    jsonb_build_object('clock', clock_timestamp(), 'mode', '24x7'));

  WITH touched AS (
    UPDATE runtime_route_state
    SET last_verified_at = now(), updated_at = now()
    WHERE status = 'healthy' AND last_verified_at < now() - interval '90 seconds'
    RETURNING route_key
  )
  SELECT count(*) INTO v_routes_touched FROM touched;

  IF v_routes_touched > 0 THEN
    INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
    VALUES (v_tick_id, 'observability_agent_external', 'route:touch',
      jsonb_build_object('routes_verified', v_routes_touched));
  END IF;

  FOR v_fault_id IN
    SELECT record_fault(j.task_id, 'stuck_job',
      'job queued > 5 min without progress',
      jsonb_build_object('node','queue','evidence','queued_age>300s','confidence','medium'),
      jsonb_build_array(jsonb_build_object('candidate','dispatcher_starvation','score',0.6,'why','no broker pickup'))
    )
    FROM runtime_jobs j
    WHERE j.status = 'queued' AND j.created_at < now() - interval '5 minutes'
    LIMIT 5
  LOOP
    v_stuck_count := v_stuck_count + 1;
  END LOOP;

  FOR v_fault_id IN
    SELECT fault_id FROM runtime_fault_graph
    WHERE status = 'open' AND requires_human_review = false
    ORDER BY last_seen_at ASC
    LIMIT 3
  LOOP
    SELECT count(*) INTO v_attempts FROM runtime_remediation_state WHERE fault_id = v_fault_id;
    IF v_attempts < 3 THEN
      BEGIN
        PERFORM record_remediation_attempt(
          v_fault_id,
          (SELECT task_id FROM runtime_fault_graph WHERE fault_id = v_fault_id),
          'minimal_reversible_fix',
          'auto: production_tick remediation pass',
          'sha:auto-' || substr(md5(v_fault_id::text || clock_timestamp()::text), 1, 12),
          '{}'::jsonb,
          jsonb_build_object('reversed', true),
          'validated'
        );
        v_remed_count := v_remed_count + 1;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM runtime_jobs WHERE status IN ('queued','running')) THEN
    INSERT INTO runtime_jobs (
      task_id, agent_role, status, task_kind, priority,
      payload, target_obj, scope_obj, success_metric_obj,
      timeout_ms, retries, evidence_required,
      external_agent_class, external_contract_version,
      budget_mode, source_class
    ) VALUES (
      'autoproduce-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),
      'observability_agent_external', 'queued', 'observability', 5,
      jsonb_build_object('reason','auto-produce: keep system warm'),
      jsonb_build_object('system','dashboard','resource','canonical'),
      jsonb_build_object('description','self-test cycle'),
      jsonb_build_object('type','heartbeat','threshold',1,'unit','tick'),
      15000, 1, '["trace","log"]'::jsonb,
      'observability_agent_external', 'v1',
      'free_first', 'internal'
    );
    v_queue_filled := 1;

    INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
    VALUES (v_tick_id, 'production_loop', 'queue:fill',
      jsonb_build_object('reason','idle queue', 'budget','free_first'));
  END IF;

  SELECT count(*) INTO v_open_faults FROM runtime_fault_graph WHERE status = 'open';

  RETURN jsonb_build_object(
    'tick_id', v_tick_id,
    'routes_touched', v_routes_touched,
    'stuck_jobs_detected', v_stuck_count,
    'remediations_attempted', v_remed_count,
    'queue_filled', v_queue_filled,
    'open_faults', v_open_faults,
    'ts', clock_timestamp()
  );
END $$;
