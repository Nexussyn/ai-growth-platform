/*
  # External Benchmarking + Phase Gate — Metrics

  1. New Projection Metrics
    - `benchmarks_run` — Total external benchmark comparisons executed
    - `benchmarks_internal_wins` — Times internal outperformed external
    - `benchmarks_external_wins` — Times external outperformed internal
    - `benchmarks_ties` — Times results were equivalent
    - `phase_gate_checks` — Number of times the phase gate was evaluated
    - `phase_gate_consecutive_passes` — Sustained passes in a row (resets on fail)
    - `phase_gate_passed` — 0 = not passed, 1 = passed
    - `scaling_phase_active` — 0 = stabilization, 1 = scaling entered
    - `critical_errors_detected` — Total critical errors since start
    - `benchmark_divergences_unresolved` — External consistently better without improvement

  2. Notes
    - No new tables (stable at 10)
    - No new agents (stable at 8)
    - Phase gate requires 10 consecutive passing evaluations before unlocking
    - Scaling only activates after gate + benchmark readiness confirmed
*/

INSERT INTO projection_metrics (metric_key, metric_value)
VALUES
  ('benchmarks_run', 0),
  ('benchmarks_internal_wins', 0),
  ('benchmarks_external_wins', 0),
  ('benchmarks_ties', 0),
  ('phase_gate_checks', 0),
  ('phase_gate_consecutive_passes', 0),
  ('phase_gate_passed', 0),
  ('scaling_phase_active', 0),
  ('critical_errors_detected', 0),
  ('benchmark_divergences_unresolved', 0)
ON CONFLICT (metric_key) DO NOTHING;
