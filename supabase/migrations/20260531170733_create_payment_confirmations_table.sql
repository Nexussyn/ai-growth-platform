/*
  # Create payment_confirmations table

  1. New Tables
    - `payment_confirmations`
      - `id` (uuid, primary key)
      - `tx_hash` (text, the on-chain transaction hash from Base)
      - `amount_usdc` (numeric, payment amount)
      - `payer_address` (text, wallet address of payer)
      - `destination_wallet` (text, operator wallet masked)
      - `network` (text, always 'base')
      - `asset` (text, always 'USDC')
      - `status` (text, confirmed/settled)
      - `confirmed_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow service_role full access for writes
    - Allow anon/authenticated to SELECT (public revenue transparency)

  3. Notes
    - This table is the single source of truth for verified on-chain payments
    - Only populated when a real tx_hash is present from x402 facilitator settlement
*/

CREATE TABLE IF NOT EXISTS payment_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash text NOT NULL,
  amount_usdc numeric NOT NULL DEFAULT 0.03,
  payer_address text NOT NULL DEFAULT '',
  destination_wallet text NOT NULL DEFAULT '',
  network text NOT NULL DEFAULT 'base',
  asset text NOT NULL DEFAULT 'USDC',
  status text NOT NULL DEFAULT 'confirmed',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage payment_confirmations"
  ON payment_confirmations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view confirmed payments"
  ON payment_confirmations
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('confirmed', 'settled'));

CREATE INDEX IF NOT EXISTS idx_payment_confirmations_tx_hash ON payment_confirmations(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_confirmed_at ON payment_confirmations(confirmed_at DESC);
