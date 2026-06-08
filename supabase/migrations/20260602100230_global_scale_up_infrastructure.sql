/*
  # Global Scale-Up Infrastructure

  1. New Connectors Added (non-overlapping with existing)
    - `api.exchangerate-api.com` — Forex/currency discovery (different from crypto)
    - `jsonplaceholder.typicode.com` — Structured task/post execution endpoint
    - `worldtimeapi.org` — Timezone/availability verification

  2. New Projection Metrics
    - `cycles_completed` — Total governed cycles run
    - `cycle_latency_avg_ms` — Rolling average cycle latency
    - `concurrent_requests_max` — High watermark for concurrency
    - `channels_active` — Number of active verified channels
    - `throttle_events` — Times load protection triggered

  3. Connector Concurrency Fields
    - `max_concurrent` — Hard cap per connector
    - `active_requests` — Current in-flight count
    - `throttled_count` — Times connector was throttled

  4. Security
    - All new rows inherit existing RLS policies (table-level RLS already enabled)
*/

-- Add new connectors (non-overlapping domains)
INSERT INTO connector_state (domain, circuit_state, total_requests, total_successes, total_failures, consecutive_failures, enabled)
VALUES
  ('api.exchangerate-api.com', 'closed', 0, 0, 0, 0, true),
  ('jsonplaceholder.typicode.com', 'closed', 0, 0, 0, 0, true),
  ('worldtimeapi.org', 'closed', 0, 0, 0, 0, true)
ON CONFLICT (domain) DO NOTHING;

-- Add concurrency tracking columns to connector_state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connector_state' AND column_name = 'max_concurrent'
  ) THEN
    ALTER TABLE connector_state ADD COLUMN max_concurrent int DEFAULT 3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connector_state' AND column_name = 'active_requests'
  ) THEN
    ALTER TABLE connector_state ADD COLUMN active_requests int DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connector_state' AND column_name = 'throttled_count'
  ) THEN
    ALTER TABLE connector_state ADD COLUMN throttled_count int DEFAULT 0;
  END IF;
END $$;

-- Add new projection metrics for throughput monitoring
INSERT INTO projection_metrics (metric_key, metric_value)
VALUES
  ('cycles_completed', 0),
  ('cycle_latency_avg_ms', 0),
  ('concurrent_requests_max', 0),
  ('channels_active', 3),
  ('throttle_events', 0)
ON CONFLICT (metric_key) DO NOTHING;
