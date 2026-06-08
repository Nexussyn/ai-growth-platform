/*
  # Product Validation First — Tracking Infrastructure

  1. New Projection Metrics for Validation
    - `validation_experiments_run` — Count of real experiments
    - `task_completions` — Successful task completions
    - `task_failures` — Failed task attempts
    - `unique_users_seen` — Distinct users observed
    - `repeated_users` — Users who returned more than once
    - `positive_feedback` — Positive signals received
    - `negative_feedback` — Negative signals received
    - `onboarding_attempts` — Onboarding starts
    - `onboarding_completions` — Successful onboards
    - `validation_score` — Composite validation score (0-100)
    - `monetization_gate_open` — 0 = locked, 1 = unlocked

  2. Notes
    - No new tables (stable at 10)
    - No new agents (stable at 8)
    - Monetization gated until validation_score >= 70
*/

INSERT INTO projection_metrics (metric_key, metric_value)
VALUES
  ('validation_experiments_run', 0),
  ('task_completions', 0),
  ('task_failures', 0),
  ('unique_users_seen', 0),
  ('repeated_users', 0),
  ('positive_feedback', 0),
  ('negative_feedback', 0),
  ('onboarding_attempts', 0),
  ('onboarding_completions', 0),
  ('validation_score', 0),
  ('monetization_gate_open', 0)
ON CONFLICT (metric_key) DO NOTHING;
