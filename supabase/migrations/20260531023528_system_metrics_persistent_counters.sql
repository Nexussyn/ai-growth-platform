/*
  # System Metrics Table — Persistent Counters

  ## Summary
  Adds a single-row table that accumulates paid_calls and total_revenue_usdc
  as persistent counters. The edge function increments these on every confirmed
  settlement via a server-side upsert, so the dashboard never reads stale
  in-memory values from the edge function's ephemeral STATE object.

  ## New Table: system_metrics

  Single-row design (id = 'singleton'). The edge function does an upsert
  on this row on every settlement.

  ### Columns
  - `id` (text, PK, default 'singleton') — fixed key so there is always exactly one row
  - `paid_calls` (bigint, default 0) — incremented on every confirmed payment
  - `total_gross_usdc` (decimal 18,6, default 0) — sum of all confirmed gross amounts
  - `total_payout_usdc` (decimal 18,6, default 0) — sum of all confirmed payout amounts
  - `total_reserve_usdc` (decimal 18,6, default 0) — sum of all confirmed reserve amounts
  - `last_payment_at` (timestamptz, nullable) — timestamp of most recent confirmed payment
  - `updated_at` (timestamptz, default now()) — last upsert timestamp

  ## Seed
  Insert the singleton row so it always exists before any payments arrive.
  Uses INSERT ... ON CONFLICT DO NOTHING so re-running the migration is safe.

  ## Security
  - RLS enabled, restrictive by default
  - SELECT: public (anon + authenticated) — allows dashboard to read counters without
    going through the edge function; these are aggregate stats, no secrets
  - INSERT/UPDATE/DELETE: service_role only — only the edge function can mutate this row
*/

CREATE TABLE IF NOT EXISTS system_metrics (
  id              text PRIMARY KEY DEFAULT 'singleton',
  paid_calls      bigint NOT NULL DEFAULT 0,
  total_gross_usdc    decimal(18,6) NOT NULL DEFAULT 0,
  total_payout_usdc   decimal(18,6) NOT NULL DEFAULT 0,
  total_reserve_usdc  decimal(18,6) NOT NULL DEFAULT 0,
  last_payment_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- Public read — counters only, no secrets
CREATE POLICY "Public can read system metrics"
  ON system_metrics FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service role can write
CREATE POLICY "Service role can insert metrics"
  ON system_metrics FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update metrics"
  ON system_metrics FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed the singleton row
INSERT INTO system_metrics (id, paid_calls, total_gross_usdc, total_payout_usdc, total_reserve_usdc)
VALUES ('singleton', 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Backfill from existing confirmed revenue_stream rows
UPDATE system_metrics
SET
  paid_calls          = (SELECT COUNT(*) FROM revenue_stream WHERE payment_status = 'confirmed'),
  total_gross_usdc    = (SELECT COALESCE(SUM(gross_revenue_usd::numeric), 0) FROM revenue_stream WHERE payment_status = 'confirmed'),
  total_payout_usdc   = (SELECT COALESCE(SUM(payout_amount_usd::numeric), 0) FROM revenue_stream WHERE payment_status = 'confirmed'),
  total_reserve_usdc  = (SELECT COALESCE(SUM(growth_reserve_usd::numeric), 0) FROM revenue_stream WHERE payment_status = 'confirmed'),
  last_payment_at     = (SELECT MAX(settled_at) FROM revenue_stream WHERE payment_status = 'confirmed'),
  updated_at          = now()
WHERE id = 'singleton';
