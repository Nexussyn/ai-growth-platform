/*
  # DLQ + Overflow Cap Infrastructure

  1. New Table
    - `dead_letter_queue`
      - `id` (uuid, primary key)
      - `task_type` (text) — type of failed task
      - `task_name` (text) — name/identifier
      - `payload` (jsonb) — full task context at time of failure
      - `failure_reason` (text) — why it was moved to DLQ
      - `retry_count` (int) — how many times it was retried
      - `classification` (text) — 'transient', 'deterministic', 'overflow', 'timeout'
      - `status` (text) — 'pending_review', 'recovered', 'discarded'
      - `created_at` (timestamptz)
      - `resolved_at` (timestamptz, nullable)

  2. New Projection Metrics
    - `dlq_depth` — current items in dead letter queue
    - `dlq_total_added` — total items ever added to DLQ
    - `dlq_recovered` — items recovered from DLQ
    - `dlq_discarded` — items permanently discarded
    - `overflow_cap_breaches` — times the overflow cap was hit
    - `overflow_tasks_deferred` — tasks deferred due to cap
    - `queue_depth_peak` — highest queue depth observed
    - `main_queue_depth` — current main queue depth

  3. Security
    - Enable RLS on dead_letter_queue
    - Service role only access

  4. Notes
    - DLQ is separate from job_queue to prevent cross-contamination
    - Overflow cap prevents embouteillage by refusing overload
    - DLQ items classified for later automated or manual recovery
*/

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL DEFAULT '',
  task_name text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text NOT NULL DEFAULT 'unknown',
  retry_count int NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'transient',
  status text NOT NULL DEFAULT 'pending_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages DLQ"
  ON dead_letter_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO projection_metrics (metric_key, metric_value)
VALUES
  ('dlq_depth', 0),
  ('dlq_total_added', 0),
  ('dlq_recovered', 0),
  ('dlq_discarded', 0),
  ('overflow_cap_breaches', 0),
  ('overflow_tasks_deferred', 0),
  ('queue_depth_peak', 0),
  ('main_queue_depth', 0)
ON CONFLICT (metric_key) DO NOTHING;
