/*
  # Durable Job Queue, Expansion Engine, and Security Gates

  1. New Tables
    - `background_jobs` — durable priority queue with SKIP LOCKED consumption
      - `id` (uuid, PK)
      - `job_type` (text) — type of job
      - `idempotency_key` (text, unique) — prevents duplicate enqueue
      - `priority` (int) — lower = higher priority
      - `status` (text) — pending/running/completed/failed/dead_letter
      - `payload` (jsonb) — job-specific input
      - `result` (jsonb) — job output
      - `lease_owner` (text) — which worker holds the lease
      - `lease_expires_at` (timestamptz) — when lease expires
      - `attempts` (int) — current attempt count
      - `max_attempts` (int) — bounded retry limit
      - `next_retry_at` (timestamptz) — exponential backoff
      - `error_message` (text)
      - `created_at`, `started_at`, `completed_at` (timestamptz)
    - `job_steps` — step-level progress within a job
      - `id` (uuid, PK)
      - `job_id` (uuid, FK)
      - `step_name` (text)
      - `status` (text)
      - `input_data` (jsonb)
      - `output_data` (jsonb)
      - `duration_ms` (int)
      - `created_at` (timestamptz)
    - `expansion_actions` — records of autonomous expansion decisions
      - `id` (uuid, PK)
      - `action_type` (text) — new_variant/new_channel/new_segment/rebalance
      - `dimension` (text) — which diversification dimension
      - `details` (jsonb)
      - `triggered_by` (text) — which job/agent triggered this
      - `status` (text) — proposed/active/rolled_back
      - `created_at` (timestamptz)
    - `security_gates` — blocking issues that prevent promotion/expansion
      - `id` (uuid, PK)
      - `gate_type` (text) — security_finding/rls_violation/function_exposure
      - `severity` (text) — critical/high/medium
      - `description` (text)
      - `blocks` (text[]) — what it blocks: promotion/expansion/deployment
      - `status` (text) — open/resolved/acknowledged
      - `resolved_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Functions
    - `enqueue_job` — atomically enqueue a new job
    - `acquire_job` — claim next job with SKIP LOCKED
    - `release_job` — mark job completed or failed with backoff
    - `reap_expired_leases` — watchdog reclaims expired leases

  3. Security
    - RLS enabled on all tables, service_role only
    - Functions are SECURITY DEFINER with explicit search_path
    - EXECUTE revoked from PUBLIC/anon/authenticated
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- BACKGROUND JOBS QUEUE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  priority int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb DEFAULT NULL,
  lease_owner text DEFAULT NULL,
  lease_expires_at timestamptz DEFAULT NULL,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  next_retry_at timestamptz DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz DEFAULT NULL,
  completed_at timestamptz DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_pending 
  ON public.background_jobs (priority, created_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_background_jobs_status 
  ON public.background_jobs (status);

CREATE INDEX IF NOT EXISTS idx_background_jobs_lease 
  ON public.background_jobs (lease_expires_at) 
  WHERE status = 'running';

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages background_jobs"
  ON public.background_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- JOB STEPS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.job_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  step_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  input_data jsonb DEFAULT '{}',
  output_data jsonb DEFAULT NULL,
  duration_ms int DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_steps_job_id ON public.job_steps (job_id);

ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages job_steps"
  ON public.job_steps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- EXPANSION ACTIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.expansion_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  dimension text NOT NULL DEFAULT 'general',
  details jsonb NOT NULL DEFAULT '{}',
  triggered_by text NOT NULL DEFAULT 'system',
  experiment_id uuid DEFAULT NULL,
  status text NOT NULL DEFAULT 'proposed',
  rollback_data jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expansion_actions_status ON public.expansion_actions (status);

ALTER TABLE public.expansion_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages expansion_actions"
  ON public.expansion_actions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECURITY GATES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.security_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text NOT NULL,
  blocks text[] NOT NULL DEFAULT ARRAY['promotion']::text[],
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz DEFAULT NULL,
  resolution_note text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_gates_open 
  ON public.security_gates (severity) 
  WHERE status = 'open';

ALTER TABLE public.security_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages security_gates"
  ON public.security_gates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- QUEUE FUNCTIONS (SECURITY DEFINER, hardened)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_job_type text,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}',
  p_priority int DEFAULT 5,
  p_max_attempts int DEFAULT 3
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.background_jobs (job_type, idempotency_key, payload, priority, max_attempts)
  VALUES (p_job_type, p_idempotency_key, p_payload, p_priority, p_max_attempts)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_job(
  p_worker_id text,
  p_lease_seconds int DEFAULT 30
)
RETURNS TABLE(
  job_id uuid,
  job_type text,
  payload jsonb,
  attempts int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.background_jobs;
BEGIN
  SELECT * INTO v_job
  FROM public.background_jobs
  WHERE public.background_jobs.status = 'pending'
    AND (public.background_jobs.next_retry_at IS NULL OR public.background_jobs.next_retry_at <= now())
  ORDER BY public.background_jobs.priority ASC, public.background_jobs.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.background_jobs
  SET status = 'running',
      lease_owner = p_worker_id,
      lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
      attempts = v_job.attempts + 1,
      started_at = COALESCE(public.background_jobs.started_at, now())
  WHERE public.background_jobs.id = v_job.id;

  job_id := v_job.id;
  job_type := v_job.job_type;
  payload := v_job.payload;
  attempts := v_job.attempts + 1;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job(
  p_job_id uuid,
  p_status text,
  p_result jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.background_jobs;
BEGIN
  SELECT * INTO v_job FROM public.background_jobs WHERE public.background_jobs.id = p_job_id;
  IF v_job.id IS NULL THEN RETURN; END IF;

  IF p_status = 'completed' THEN
    UPDATE public.background_jobs
    SET status = 'completed',
        result = p_result,
        lease_owner = NULL,
        lease_expires_at = NULL,
        completed_at = now()
    WHERE public.background_jobs.id = p_job_id;
  ELSIF p_status = 'failed' THEN
    IF v_job.attempts >= v_job.max_attempts THEN
      UPDATE public.background_jobs
      SET status = 'dead_letter',
          error_message = p_error,
          lease_owner = NULL,
          lease_expires_at = NULL,
          completed_at = now()
      WHERE public.background_jobs.id = p_job_id;
    ELSE
      UPDATE public.background_jobs
      SET status = 'pending',
          error_message = p_error,
          lease_owner = NULL,
          lease_expires_at = NULL,
          next_retry_at = now() + ((5 * power(2, v_job.attempts)) || ' seconds')::interval
                          + (random() * 10 || ' seconds')::interval
      WHERE public.background_jobs.id = p_job_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reap_expired_leases()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.background_jobs
  SET status = 'pending',
      lease_owner = NULL,
      lease_expires_at = NULL,
      error_message = COALESCE(error_message, '') || ' [lease expired]'
  WHERE public.background_jobs.status = 'running'
    AND public.background_jobs.lease_expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_job(text, text, jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_job(text, text, jsonb, int, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.acquire_job(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_job(text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_job(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_job(uuid, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.reap_expired_leases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_expired_leases() TO service_role;
