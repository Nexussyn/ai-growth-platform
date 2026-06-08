/*
  # Revenue Split Fields for revenue_stream

  ## Summary
  Adds server-side revenue split tracking to every payment record.
  After confirmation the edge function computes:
    - payout_amount_usd  = gross * 0.75  (sent to destination wallet)
    - growth_reserve_usd = gross * 0.25  (retained server-side)

  ## New columns on revenue_stream

  1. `gross_amount_usd` — alias view-friendly column; gross_revenue_usd already exists,
     this migration does NOT rename it — gross_revenue_usd is the canonical column.

  2. `growth_reserve_usd` (decimal 12,6, default 0)
     25% of gross. Retained server-side. Never paid out. Logged for audit.

  3. `payout_amount_usd` (decimal 12,6, default 0)
     75% of gross. Routed to destination wallet on confirmation.

  4. `destination_wallet_masked` (text, default '')
     Last 6 chars of the wallet address at the time of settlement.
     Full address is never stored. Populated from server-side secret at settlement.

  5. `split_pct_payout` (smallint, default 75)
     The payout percentage applied. Stored so future split changes are auditable.

  ## Backfill
  Existing confirmed rows are backfilled with the 75/25 split applied to gross_revenue_usd.
  Pending and failed rows keep zero split values (they have not been settled).

  ## Security
  - RLS unchanged: service_role only for all operations on revenue_stream.
  - destination_wallet_masked stores only the last 6 chars — no full address in DB.
*/

-- growth_reserve_usd
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'growth_reserve_usd'
  ) THEN
    ALTER TABLE revenue_stream ADD COLUMN growth_reserve_usd decimal(12,6) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- payout_amount_usd
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'payout_amount_usd'
  ) THEN
    ALTER TABLE revenue_stream ADD COLUMN payout_amount_usd decimal(12,6) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- destination_wallet_masked
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'destination_wallet_masked'
  ) THEN
    ALTER TABLE revenue_stream ADD COLUMN destination_wallet_masked text NOT NULL DEFAULT '';
  END IF;
END $$;

-- split_pct_payout
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'split_pct_payout'
  ) THEN
    ALTER TABLE revenue_stream ADD COLUMN split_pct_payout smallint NOT NULL DEFAULT 75;
  END IF;
END $$;

-- Backfill existing confirmed rows with 75/25 split
UPDATE revenue_stream
SET
  payout_amount_usd  = ROUND(gross_revenue_usd::numeric * 0.75, 6),
  growth_reserve_usd = ROUND(gross_revenue_usd::numeric * 0.25, 6),
  split_pct_payout   = 75
WHERE payment_status = 'confirmed'
  AND payout_amount_usd = 0;
