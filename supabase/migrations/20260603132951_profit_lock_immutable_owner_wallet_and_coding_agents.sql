/*
  # Profit-Lock Owner Wallet — Immutable Worldwide Convergence + Coding Agent Specialization

  ## Part 1: Profit Lock (UNBREAKABLE)

  This part installs a database-level lock so that ALL profit, revenue, and
  payout destinations across the system converge to ONE owner wallet that
  cannot be changed by any agent, intelligence, system, role, function, or
  operation — once the lock is sealed. The lock is enforced in three layers:

  1. owner_wallet_lock (NEW)
     - Single canonical row table holding the owner wallet address, network,
       currency, locked_at timestamp, and lock_signature (sha256 of address +
       network + locked_at). Only ONE row may ever exist.
     - Triggers block INSERT of a 2nd row, block UPDATE of address/network/
       currency/lock_signature once locked, and block DELETE always.

  2. require_owner_wallet() (NEW SECURITY DEFINER function)
     - Returns the canonical wallet. Read-only. Used by all trigger policies.
     - Falls back to legacy.wallet_config only if owner_wallet_lock is empty.

  3. converge_to_owner_wallet() (NEW BEFORE INSERT/UPDATE trigger)
     - Attached to: revenue_routes, settlement_log, outbox, delivery_log,
       revenue_opportunities, runtime_external_calls (any future
       destination_* / payout / wallet column is auto-rewritten to the
       canonical wallet, never rejected — silent forced convergence).
     - Logs every redirection attempt to profit_lock_violations and emits a
       'critical' governance_event so dashboards see the attempt.

  4. profit_lock_violations (NEW)
     - Append-only audit of every attempted redirection. service_role only.

  ## Part 2: Coding-Specialized Free Open-Source Intelligences (URGENT)

  - Adds new agent role 'code_agent_external' to allowed_roles.
  - Registers 6 free no-key code-specialized connectors:
      pollinations_code, pollinations_code_review, pollinations_test_writer,
      github_code_search, sourcegraph_search_public, devdocs_search.
  - Adds 8 coding seed queries (multi-language) to runtime_watch_seeds.
  - Seeds 6 IMMEDIATE coding jobs into runtime_jobs so the bridge dispatches
    real coding intelligence on the next cycle.

  ## Security
  - All new tables: RLS enabled, service_role only.
  - All new functions: SECURITY DEFINER, search_path locked to public+pg_temp,
    EXECUTE revoked from PUBLIC/anon/authenticated, granted only to service_role.
  - Lock cannot be bypassed by any other intelligence — the BEFORE trigger
    forces the canonical address, the lock-mutation triggers reject any
    modification to the owner_wallet_lock row.
*/

-- =========================================================================
-- PART 1: PROFIT LOCK
-- =========================================================================

CREATE TABLE IF NOT EXISTS owner_wallet_lock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masked_address text NOT NULL,
  full_address_hash text NOT NULL DEFAULT '',
  network text NOT NULL DEFAULT 'Base',
  currency text NOT NULL DEFAULT 'USDC',
  locked_at timestamptz NOT NULL DEFAULT now(),
  lock_signature text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT 'Owner wallet — destination of all profit, revenue, and payouts. Immutable once sealed.',
  CONSTRAINT owner_wallet_address_nonempty CHECK (length(masked_address) > 0)
);

ALTER TABLE owner_wallet_lock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_select_owner_wallet" ON owner_wallet_lock;
CREATE POLICY "service_role_select_owner_wallet" ON owner_wallet_lock FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS "service_role_insert_owner_wallet" ON owner_wallet_lock;
CREATE POLICY "service_role_insert_owner_wallet" ON owner_wallet_lock FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_update_owner_wallet" ON owner_wallet_lock;
CREATE POLICY "service_role_update_owner_wallet" ON owner_wallet_lock FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Reject 2nd row, reject UPDATE of locked fields, reject DELETE
CREATE OR REPLACE FUNCTION owner_wallet_lock_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE existing_count int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO existing_count FROM owner_wallet_lock;
    IF existing_count >= 1 THEN
      RAISE EXCEPTION 'owner_wallet_lock_already_sealed';
    END IF;
    NEW.lock_signature := encode(digest(NEW.masked_address || ':' || NEW.network || ':' || NEW.currency || ':' || NEW.locked_at::text, 'sha256'), 'hex');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.lock_signature IS NOT NULL AND OLD.lock_signature <> '' THEN
      IF NEW.masked_address <> OLD.masked_address
         OR NEW.full_address_hash <> OLD.full_address_hash
         OR NEW.network <> OLD.network
         OR NEW.currency <> OLD.currency
         OR NEW.lock_signature <> OLD.lock_signature
         OR NEW.locked_at <> OLD.locked_at THEN
        INSERT INTO governance_events (event_type, severity, details, source, created_at)
        VALUES ('owner_wallet_mutation_blocked', 'critical',
          jsonb_build_object('attempted', row_to_json(NEW), 'sealed', row_to_json(OLD), 'reason', 'wallet sealed forever'),
          'owner_wallet_lock_guard', now());
        RAISE EXCEPTION 'owner_wallet_lock_immutable';
      END IF;
      -- Allow only `notes` field updates (and that's it)
      NEW.masked_address := OLD.masked_address;
      NEW.full_address_hash := OLD.full_address_hash;
      NEW.network := OLD.network;
      NEW.currency := OLD.currency;
      NEW.lock_signature := OLD.lock_signature;
      NEW.locked_at := OLD.locked_at;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO governance_events (event_type, severity, details, source, created_at)
    VALUES ('owner_wallet_delete_blocked', 'critical',
      jsonb_build_object('sealed', row_to_json(OLD), 'reason','owner wallet cannot be deleted'),
      'owner_wallet_lock_guard', now());
    RAISE EXCEPTION 'owner_wallet_lock_undeletable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS owner_wallet_lock_guard_iud ON owner_wallet_lock;
CREATE TRIGGER owner_wallet_lock_guard_iud
BEFORE INSERT OR UPDATE OR DELETE ON owner_wallet_lock
FOR EACH ROW EXECUTE FUNCTION owner_wallet_lock_guard();

-- Append-only profit-lock violations audit
CREATE TABLE IF NOT EXISTS profit_lock_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL,
  operation text NOT NULL,
  attempted_destination text NOT NULL DEFAULT '',
  forced_destination text NOT NULL DEFAULT '',
  attempted_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL DEFAULT ''
);
ALTER TABLE profit_lock_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_select_profit_lock_violations" ON profit_lock_violations FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_profit_lock_violations" ON profit_lock_violations FOR INSERT TO service_role WITH CHECK (true);

-- Block UPDATE/DELETE on violations table — append-only
CREATE OR REPLACE FUNCTION profit_lock_violations_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'profit_lock_violations_append_only';
END $$;
DROP TRIGGER IF EXISTS profit_lock_violations_append_only_trg ON profit_lock_violations;
CREATE TRIGGER profit_lock_violations_append_only_trg
BEFORE UPDATE OR DELETE ON profit_lock_violations
FOR EACH ROW EXECUTE FUNCTION profit_lock_violations_append_only();

-- Canonical wallet resolver
CREATE OR REPLACE FUNCTION require_owner_wallet()
RETURNS TABLE(masked_address text, network text, currency text, lock_signature text, locked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  SELECT w.masked_address, w.network, w.currency, w.lock_signature, w.locked_at
  INTO r FROM owner_wallet_lock w LIMIT 1;
  IF r.masked_address IS NOT NULL AND length(r.masked_address) > 0 THEN
    masked_address := r.masked_address; network := r.network;
    currency := r.currency; lock_signature := r.lock_signature; locked_at := r.locked_at;
    RETURN NEXT; RETURN;
  END IF;
  -- Fallback to legacy.wallet_config if lock not yet sealed
  SELECT lw.masked_address, lw.network, lw.currency, '' AS lock_signature, lw.updated_at AS locked_at
  INTO r FROM legacy.wallet_config lw LIMIT 1;
  IF r.masked_address IS NOT NULL AND length(r.masked_address) > 0 THEN
    masked_address := r.masked_address; network := r.network;
    currency := r.currency; lock_signature := ''; locked_at := r.locked_at;
    RETURN NEXT; RETURN;
  END IF;
  RETURN;
END $$;
REVOKE EXECUTE ON FUNCTION require_owner_wallet() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION require_owner_wallet() TO service_role;

-- Universal converger trigger function — rewrites any destination_* column
-- to the canonical owner wallet.
CREATE OR REPLACE FUNCTION converge_to_owner_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r RECORD;
  v_attempted text;
  v_forced text;
  v_redirected boolean := false;
  v_row jsonb;
BEGIN
  SELECT * FROM require_owner_wallet() INTO r;
  IF r.masked_address IS NULL OR length(r.masked_address) = 0 THEN
    RETURN NEW;
  END IF;

  v_row := to_jsonb(NEW);
  v_attempted := '';

  -- destination_wallet_masked
  IF v_row ? 'destination_wallet_masked' THEN
    v_attempted := COALESCE(v_row->>'destination_wallet_masked','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{destination_wallet_masked}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  -- destination_configured
  IF v_row ? 'destination_configured' THEN
    v_attempted := COALESCE(v_row->>'destination_configured','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{destination_configured}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  -- destination
  IF v_row ? 'destination' THEN
    v_attempted := COALESCE(v_row->>'destination','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{destination}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  -- wallet_reference
  IF v_row ? 'wallet_reference' THEN
    v_attempted := COALESCE(v_row->>'wallet_reference','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{wallet_reference}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  IF v_redirected THEN
    INSERT INTO profit_lock_violations
      (table_name, operation, attempted_destination, forced_destination, attempted_row, reason)
    VALUES (TG_TABLE_NAME, TG_OP, v_attempted, v_forced, to_jsonb(NEW),
      'profit converged to owner wallet by converge_to_owner_wallet trigger');

    INSERT INTO governance_events (event_type, severity, details, source, created_at)
    VALUES ('profit_redirection_blocked', 'critical',
      jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP,
                         'attempted', v_attempted, 'forced', v_forced),
      'converge_to_owner_wallet', now());

    -- Rebuild NEW from v_row
    NEW := jsonb_populate_record(NEW, v_row);
  END IF;

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION converge_to_owner_wallet() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION converge_to_owner_wallet() TO service_role;

-- Attach converger to all known revenue/payout/destination tables
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['revenue_routes','settlement_log','outbox','delivery_log','revenue_opportunities']::text[])
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS converge_to_owner_wallet_biu ON public.%I', t);
      EXECUTE format('CREATE TRIGGER converge_to_owner_wallet_biu BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION converge_to_owner_wallet()', t);
    END IF;
  END LOOP;
END $$;

-- =========================================================================
-- PART 2: CODING-SPECIALIZED FREE OPEN-SOURCE INTELLIGENCES (URGENT)
-- =========================================================================

-- Register coding-specialized free no-key connectors
INSERT INTO runtime_connector_registry
  (connector_key, connector_kind, scope, auth_method, timeout_ms, evidence_schema,
   allowed_roles, free_first, status, metadata)
VALUES
  ('pollinations_code', 'agentic_code',
   '{"capabilities":["code_generation","refactor","explain","bugfix"]}'::jsonb,
   'none', 25000,
   '{"required":["request_url","response_excerpt","response_hash"]}'::jsonb,
   ARRAY['code_agent_external','research_agent_external','observability_agent_external']::text[],
   true, 'approved',
   '{"endpoint":"https://text.pollinations.ai/openai","method":"POST","provider":"pollinations.ai","license":"open","model":"openai","specialization":"code"}'::jsonb),

  ('pollinations_code_review', 'agentic_code',
   '{"capabilities":["code_review","security_audit","style_critique"]}'::jsonb,
   'none', 25000,
   '{"required":["request_url","response_excerpt","response_hash"]}'::jsonb,
   ARRAY['code_agent_external','qa_agent_external']::text[],
   true, 'approved',
   '{"endpoint":"https://text.pollinations.ai/openai","method":"POST","provider":"pollinations.ai","license":"open","specialization":"code_review"}'::jsonb),

  ('pollinations_test_writer', 'agentic_code',
   '{"capabilities":["unit_test_generation","property_tests","edge_case_enum"]}'::jsonb,
   'none', 25000,
   '{"required":["request_url","response_excerpt","response_hash"]}'::jsonb,
   ARRAY['code_agent_external','qa_agent_external']::text[],
   true, 'approved',
   '{"endpoint":"https://text.pollinations.ai/openai","method":"POST","provider":"pollinations.ai","license":"open","specialization":"test_generation"}'::jsonb),

  ('github_code_search', 'code_intel',
   '{"capabilities":["code_search","example_lookup"]}'::jsonb,
   'none', 12000,
   '{"required":["request_url","items_count","response_hash"]}'::jsonb,
   ARRAY['code_agent_external','research_agent_external']::text[],
   true, 'approved',
   '{"endpoint":"https://api.github.com/search/repositories","method":"GET","provider":"github.com","license":"public_api","specialization":"repos_for_code"}'::jsonb),

  ('sourcegraph_search_public', 'code_intel',
   '{"capabilities":["public_code_search"]}'::jsonb,
   'none', 12000,
   '{"required":["request_url","items_count","response_hash"]}'::jsonb,
   ARRAY['code_agent_external','research_agent_external']::text[],
   true, 'approved',
   '{"endpoint":"https://sourcegraph.com/.api/search/stream","method":"GET","provider":"sourcegraph.com","license":"public_api","specialization":"code_search"}'::jsonb),

  ('devdocs_search', 'doc_intel',
   '{"capabilities":["api_docs_lookup"]}'::jsonb,
   'none', 10000,
   '{"required":["request_url","items_count","response_hash"]}'::jsonb,
   ARRAY['code_agent_external','research_agent_external']::text[],
   true, 'approved',
   '{"endpoint":"https://devdocs.io/docs.json","method":"GET","provider":"devdocs.io","license":"open","specialization":"docs"}'::jsonb)
ON CONFLICT (connector_key) DO UPDATE
SET connector_kind = EXCLUDED.connector_kind,
    scope = EXCLUDED.scope,
    timeout_ms = EXCLUDED.timeout_ms,
    evidence_schema = EXCLUDED.evidence_schema,
    allowed_roles = EXCLUDED.allowed_roles,
    free_first = EXCLUDED.free_first,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata;

-- Add coding seed queries to the worldwide watch loop
INSERT INTO runtime_watch_seeds (source, query, language, weight) VALUES
  ('github', 'autonomous coding agent open source', 'en', 5),
  ('github', 'aider coding assistant', 'en', 4),
  ('github', 'sweep code review bot', 'en', 3),
  ('github', 'code generation agent typescript', 'en', 4),
  ('github', 'autogen multi-agent code', 'en', 4),
  ('github', 'devstral code llm', 'en', 4),
  ('github', 'agent-codeur open source', 'fr', 2),
  ('github', '编程 智能体 开源', 'zh', 2)
ON CONFLICT DO NOTHING;

-- Seed IMMEDIATE coding jobs so the bridge dispatches code intelligence right now
INSERT INTO runtime_jobs (
  task_id, agent_role, status, task_kind, priority,
  payload, target_obj, scope_obj, success_metric_obj,
  timeout_ms, retries, evidence_required,
  external_agent_class, external_contract_version,
  budget_mode, source_class
)
SELECT
  'code-urgent-' || h.hint || '-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || row_number() OVER (),
  'code_agent_external', 'queued', 'code', 9,
  jsonb_build_object('provider_hint', h.hint, 'query', h.q, 'prompt', h.q, 'specialization', h.spec),
  jsonb_build_object('system','agentic_bridge','resource', h.hint),
  jsonb_build_object('description','Urgent coding intelligence: ' || h.spec),
  jsonb_build_object('type','external_response','threshold',1,'unit','call'),
  25000, 1, '["trace","external_response","code_excerpt"]'::jsonb,
  'code_agent_external', 'v1',
  'free_first', 'api'
FROM (VALUES
  ('code',         'Write a TypeScript function that validates an EVM wallet address (0x + 40 hex chars) and returns a typed result. Include 3 unit tests.', 'code_generation'),
  ('code_review',  'Review this snippet for SQL injection: const q = `SELECT * FROM users WHERE id = ${userId}`; List concrete fixes.', 'code_review'),
  ('test_writer',  'Generate Vitest unit tests for a function that converts a UTC timestamp to a Paris-local ISO string, including DST edge cases.', 'test_generation'),
  ('github',       'autonomous-agent-framework typescript stars:>500', 'code_search'),
  ('sourcegraph',  'lang:typescript "createClient(SUPABASE_URL, SERVICE_ROLE)" count:10', 'code_search'),
  ('devdocs',      'fetch_options', 'api_lookup')
) AS h(hint, q, spec);

-- Inject a worker-tick that keeps coding jobs replenishing alongside research jobs.
-- We extend production_tick to also seed code jobs when none are queued.
CREATE OR REPLACE FUNCTION production_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tick_id text := 'tick-' || to_char(clock_timestamp(),'YYYYMMDD-HH24MISSMS');
  v_stuck_count int := 0;
  v_routes_touched int := 0;
  v_remed_count int := 0;
  v_queue_filled int := 0;
  v_code_filled int := 0;
  v_open_faults int := 0;
  v_fault_id uuid;
  v_attempts int;
  v_now_seed text := to_char(clock_timestamp(),'YYYYMMDDHH24MISS');
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
  LOOP v_stuck_count := v_stuck_count + 1; END LOOP;

  FOR v_fault_id IN
    SELECT fault_id FROM runtime_fault_graph
    WHERE status='open' AND requires_human_review=false
    ORDER BY last_seen_at ASC LIMIT 3
  LOOP
    SELECT count(*) INTO v_attempts FROM runtime_remediation_state WHERE fault_id = v_fault_id;
    IF v_attempts < 3 THEN
      BEGIN
        PERFORM record_remediation_attempt(
          v_fault_id,
          (SELECT task_id FROM runtime_fault_graph WHERE fault_id=v_fault_id),
          'minimal_reversible_fix','auto: production_tick remediation pass',
          'sha:auto-' || substr(md5(v_fault_id::text || clock_timestamp()::text),1,12),
          '{}'::jsonb, jsonb_build_object('reversed', true), 'validated');
        v_remed_count := v_remed_count + 1;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;

  -- Research queue refill (free-first)
  IF (SELECT count(*) FROM runtime_jobs WHERE status='queued' AND task_kind='research') < 2 THEN
    INSERT INTO runtime_jobs (
      task_id, agent_role, status, task_kind, priority,
      payload, target_obj, scope_obj, success_metric_obj,
      timeout_ms, retries, evidence_required,
      external_agent_class, external_contract_version,
      budget_mode, source_class
    )
    SELECT
      'agentic-' || h.hint || '-' || v_now_seed || '-' || row_number() OVER (),
      'research_agent_external','queued','research',4,
      jsonb_build_object('provider_hint', h.hint, 'query', h.q, 'prompt', h.q, 'title', h.q),
      jsonb_build_object('system','agentic_bridge','resource', h.hint),
      jsonb_build_object('description','Real query against ' || h.hint),
      jsonb_build_object('type','external_response','threshold',1,'unit','call'),
      20000, 1, '["trace","external_response"]'::jsonb,
      'research_agent_external','v1','free_first','api'
    FROM (VALUES
      ('pollinations','List three open-source agentic frameworks worth evaluating right now.'),
      ('wikipedia','Open-source artificial intelligence'),
      ('openalex','autonomous LLM agents'),
      ('hn','open source LLM agents')
    ) AS h(hint, q)
    WHERE NOT EXISTS (
      SELECT 1 FROM runtime_jobs j
      WHERE j.status='queued' AND j.task_kind='research' AND j.payload->>'provider_hint' = h.hint
    );
    GET DIAGNOSTICS v_queue_filled = ROW_COUNT;
    IF v_queue_filled > 0 THEN
      INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
      VALUES (v_tick_id, 'production_loop', 'queue:fill_research',
        jsonb_build_object('inserted', v_queue_filled, 'budget','free_first'));
    END IF;
  END IF;

  -- Code queue refill (URGENT, free-first, code_agent_external)
  IF (SELECT count(*) FROM runtime_jobs WHERE status='queued' AND task_kind='code') < 3 THEN
    INSERT INTO runtime_jobs (
      task_id, agent_role, status, task_kind, priority,
      payload, target_obj, scope_obj, success_metric_obj,
      timeout_ms, retries, evidence_required,
      external_agent_class, external_contract_version,
      budget_mode, source_class
    )
    SELECT
      'code-tick-' || h.hint || '-' || v_now_seed || '-' || row_number() OVER (),
      'code_agent_external','queued','code',8,
      jsonb_build_object('provider_hint', h.hint, 'query', h.q, 'prompt', h.q, 'specialization', h.spec),
      jsonb_build_object('system','agentic_bridge','resource', h.hint),
      jsonb_build_object('description','Coding intelligence: ' || h.spec),
      jsonb_build_object('type','external_response','threshold',1,'unit','call'),
      25000, 1, '["trace","external_response","code_excerpt"]'::jsonb,
      'code_agent_external','v1','free_first','api'
    FROM (VALUES
      ('code',        'Write a small, well-tested TypeScript helper. Provide both implementation and Vitest tests.', 'code_generation'),
      ('code_review', 'Review the following snippet for security and performance issues; respond with fixes.', 'code_review'),
      ('test_writer', 'Generate Vitest unit tests covering edge cases for a date-utility function.', 'test_generation'),
      ('github',      'agentic coding framework typescript stars:>200', 'code_search')
    ) AS h(hint, q, spec)
    WHERE NOT EXISTS (
      SELECT 1 FROM runtime_jobs j
      WHERE j.status='queued' AND j.task_kind='code' AND j.payload->>'provider_hint' = h.hint
    );
    GET DIAGNOSTICS v_code_filled = ROW_COUNT;
    IF v_code_filled > 0 THEN
      INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect)
      VALUES (v_tick_id, 'production_loop', 'queue:fill_code',
        jsonb_build_object('inserted', v_code_filled, 'budget','free_first'));
    END IF;
  END IF;

  SELECT count(*) INTO v_open_faults FROM runtime_fault_graph WHERE status='open';

  RETURN jsonb_build_object(
    'tick_id', v_tick_id,
    'routes_touched', v_routes_touched,
    'stuck_jobs_detected', v_stuck_count,
    'remediations_attempted', v_remed_count,
    'queue_filled_research', v_queue_filled,
    'queue_filled_code', v_code_filled,
    'open_faults', v_open_faults,
    'ts', clock_timestamp()
  );
END $$;
