/*
  # Persistence RPC functions for governed runtime
  Bypasses PostgREST schema cache (PGRST002) via direct RPC calls.
*/
CREATE OR REPLACE FUNCTION persist_events(events jsonb) RETURNS integer AS $$
DECLARE inserted integer := 0;
BEGIN
  INSERT INTO domain_events (event_type, agent, target, status, payload, correlation_id)
  SELECT e->>'event_type', e->>'agent', e->>'target', e->>'status', (e->'payload')::jsonb, COALESCE(e->>'correlation_id', gen_random_uuid()::text)::uuid
  FROM jsonb_array_elements(events) AS e;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION persist_deliveries(deliveries jsonb) RETURNS integer AS $$
DECLARE inserted integer := 0;
BEGIN
  INSERT INTO delivery_log (correlation_id, agent, destination, method, status_code, response_preview, success, error_message, attempt, idempotency_key)
  SELECT (d->>'correlation_id')::uuid, d->>'agent', d->>'destination', COALESCE(d->>'method','GET'), (d->>'status_code')::integer, d->>'response_preview', COALESCE((d->>'success')::boolean,false), d->>'error_message', COALESCE((d->>'attempt')::integer,1), d->>'idempotency_key'
  FROM jsonb_array_elements(deliveries) AS d;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_projection(p_key text, p_delta numeric) RETURNS numeric AS $$
DECLARE new_val numeric;
BEGIN
  UPDATE projection_metrics SET metric_value = metric_value + p_delta, updated_at = now() WHERE metric_key = p_key RETURNING metric_value INTO new_val;
  RETURN COALESCE(new_val, 0);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_connector(p_domain text, p_success boolean, p_error text DEFAULT NULL) RETURNS void AS $$
BEGIN
  IF p_success THEN
    UPDATE connector_state SET total_requests = total_requests + 1, total_successes = total_successes + 1, consecutive_failures = 0, circuit_state = 'closed', last_success_at = now() WHERE domain = p_domain;
  ELSE
    UPDATE connector_state SET total_requests = total_requests + 1, total_failures = total_failures + 1, consecutive_failures = consecutive_failures + 1, circuit_state = CASE WHEN consecutive_failures >= 4 THEN 'open' ELSE circuit_state END, last_failure_at = now(), last_error = p_error WHERE domain = p_domain;
  END IF;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
