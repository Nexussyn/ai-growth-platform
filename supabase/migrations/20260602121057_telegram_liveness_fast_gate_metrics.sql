/*
  # Telegram Liveness + Fast Phase Gate — Additional Metrics

  1. New Projection Metrics
    - `telegram_sends_attempted` — Total Telegram sends attempted
    - `telegram_sends_succeeded` — Successful deliveries
    - `telegram_sends_failed` — Failed deliveries (after retries)
    - `telegram_consecutive_failures` — Consecutive fails (hard stop trigger)
    - `telegram_liveness_confirmed` — 0 = unconfirmed, 1 = at least one successful send

  2. Notes
    - No new tables (stable at 10)
    - No new agents (stable at 8)
    - Telegram liveness is now a phase gate criterion
    - Fast gate: passes immediately when sustained window met (no artificial delay)
*/

INSERT INTO projection_metrics (metric_key, metric_value)
VALUES
  ('telegram_sends_attempted', 0),
  ('telegram_sends_succeeded', 0),
  ('telegram_sends_failed', 0),
  ('telegram_consecutive_failures', 0),
  ('telegram_liveness_confirmed', 0)
ON CONFLICT (metric_key) DO NOTHING;
