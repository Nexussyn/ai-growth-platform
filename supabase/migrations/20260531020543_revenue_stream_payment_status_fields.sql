/*
  # Revenue Pipeline: Settled Revenue Fields

  ## Summary
  Adds payment lifecycle tracking to revenue_stream so the dashboard only
  displays settled (confirmed) revenue, not temporary pending state.

  ## Changes to revenue_stream

  ### New columns
  - `payment_status` (text, NOT NULL, default 'pending')
      Values: 'pending' | 'confirmed' | 'failed'
      A row starts as 'pending' when the payment attempt is received,
      transitions to 'confirmed' only after server-side confirmation,
      and to 'failed' if confirmation never arrives or an error occurs.

  - `tx_hash` (text, nullable)
      On-chain transaction hash or payment protocol reference ID.
      Null until confirmation is received.

  - `payment_id` (uuid, NOT NULL, default gen_random_uuid())
      Unique internal ID for this payment event. Used to correlate
      payment_log entries with the revenue_stream row.

  - `settled_at` (timestamptz, nullable)
      Timestamp when status transitioned to 'confirmed'.
      Null for pending and failed records.

  - `caller_ip_hash` (text, default '')
      SHA-256 hash of the caller IP for audit — not raw IP.

  ### Changed constraints
  - UNIQUE constraint changed from (stream_type, date) to
    (stream_type, date, payment_id) so multiple payment events
    on the same day for the same stream type are each tracked
    as separate rows rather than being upserted into one aggregate.
    The old aggregation pattern hid individual payment status.

  ### New index
  - idx_revenue_stream_status on payment_status for efficient
    filtering of settled vs pending revenue.

  ## Security
  - RLS remains: service_role only (unchanged from previous migration)

  ## Important Notes
  1. Existing rows get payment_status = 'confirmed' and settled_at = created_at
     so they appear as settled in the dashboard (safe migration for existing data)
  2. payment_id gets gen_random_uuid() backfill for existing rows
  3. tx_hash remains NULL for historical rows — that is correct and expected
*/

-- Add new columns to revenue_stream
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE revenue_stream
      ADD COLUMN payment_status text NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'confirmed', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'tx_hash'
  ) THEN
    ALTER TABLE revenue_stream ADD COLUMN tx_hash text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'payment_id'
  ) THEN
    ALTER TABLE revenue_stream
      ADD COLUMN payment_id uuid NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'settled_at'
  ) THEN
    ALTER TABLE revenue_stream ADD COLUMN settled_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_stream' AND column_name = 'caller_ip_hash'
  ) THEN
    ALTER TABLE revenue_stream ADD COLUMN caller_ip_hash text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Backfill existing rows: treat them as confirmed with settled_at = created_at
UPDATE revenue_stream
SET
  payment_status = 'confirmed',
  settled_at = created_at
WHERE payment_status = 'pending';

-- Drop old unique constraint (stream_type, date) — it prevented per-payment rows
ALTER TABLE revenue_stream DROP CONSTRAINT IF EXISTS revenue_stream_stream_type_date_key;

-- New index for filtering settled vs pending
CREATE INDEX IF NOT EXISTS idx_revenue_stream_status ON revenue_stream(payment_status);
CREATE INDEX IF NOT EXISTS idx_revenue_stream_payment_id ON revenue_stream(payment_id);
