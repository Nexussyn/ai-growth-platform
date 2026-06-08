/*
  # Part 3: SKIP LOCKED functions and agent cap enforcement
*/
CREATE OR REPLACE FUNCTION claim_job(p_agent text, p_job_type text DEFAULT NULL) RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM job_queue WHERE status = 'queued' AND agent = p_agent AND (p_job_type IS NULL OR job_type = p_job_type) ORDER BY priority DESC, created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_id IS NOT NULL THEN UPDATE job_queue SET status = 'processing', locked_by = p_agent, locked_at = now() WHERE id = v_id; END IF;
  RETURN v_id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION claim_outbox_batch(p_limit integer DEFAULT 5) RETURNS SETOF uuid AS $$
BEGIN
  RETURN QUERY UPDATE outbox SET status = 'processing' WHERE id IN (SELECT id FROM outbox WHERE status = 'pending' ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED) RETURNING id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_agent_cap() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM governed_agents) >= 8 THEN RAISE EXCEPTION 'Agent hard cap: max 8'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_agent_cap ON governed_agents;
CREATE TRIGGER trg_enforce_agent_cap BEFORE INSERT ON governed_agents FOR EACH ROW EXECUTE FUNCTION enforce_agent_cap();
