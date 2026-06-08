/*
  # Continuous Stabilization — Task Queue and Heartbeat Metrics

  1. New Projection Metrics
    - `heartbeats_emitted` — Total heartbeats since start
    - `tasks_completed_total` — All tasks completed (internal + external)
    - `tasks_internal` — Internal maintenance tasks completed
    - `tasks_external` — External experiment tasks completed
    - `consecutive_idle_cycles` — Cycles with no progress (hard stop trigger)
    - `duplicate_executions_detected` — Safety counter
    - `last_heartbeat_epoch` — Unix timestamp of last heartbeat
    - `scheduler_ticks` — Total scheduler invocations
    - `hard_stops_triggered` — Times safety stopped

  2. Notes
    - No new tables (stable at 10 governed tables)
    - No new agents (stable at 8)
    - Monetization remains locked
    - These metrics enable the runtime to self-monitor continuous operation
*/

INSERT INTO projection_metrics (metric_key, metric_value)
VALUES
  ('heartbeats_emitted', 0),
  ('tasks_completed_total', 0),
  ('tasks_internal', 0),
  ('tasks_external', 0),
  ('consecutive_idle_cycles', 0),
  ('duplicate_executions_detected', 0),
  ('last_heartbeat_epoch', 0),
  ('scheduler_ticks', 0),
  ('hard_stops_triggered', 0)
ON CONFLICT (metric_key) DO NOTHING;
