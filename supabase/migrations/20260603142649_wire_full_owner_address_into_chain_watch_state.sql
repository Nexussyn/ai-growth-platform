/*
  # Wire full owner address into chain_watch_state for log filtering
  Fixed: create legacy schema + wallet_config table if they don't exist
*/

-- Ensure legacy schema exists
CREATE SCHEMA IF NOT EXISTS legacy;

-- Ensure legacy.wallet_config exists
CREATE TABLE IF NOT EXISTS legacy.wallet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masked_address text,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chain_watch_state' AND column_name='watch_address'
  ) THEN
    ALTER TABLE chain_watch_state ADD COLUMN watch_address text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='legacy' AND table_name='wallet_config' AND column_name='address_full_hex'
  ) THEN
    ALTER TABLE legacy.wallet_config ADD COLUMN address_full_hex text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
DECLARE
  v_full text := '0xb438d36b425b504724a1c72aa0941c80cb940995';
  v_expected_hash text;
  v_stored_hash text;
BEGIN
  v_expected_hash := encode(extensions.digest(v_full, 'sha256'), 'hex');
  SELECT full_address_hash INTO v_stored_hash FROM owner_wallet_lock LIMIT 1;
  IF v_stored_hash IS NULL OR v_stored_hash <> v_expected_hash THEN
    RAISE NOTICE 'address_digest_mismatch_skipping_update';
    RETURN;
  END IF;

  UPDATE chain_watch_state SET watch_address = v_full WHERE id = 'base-usdc';
  UPDATE legacy.wallet_config SET address_full_hex = v_full;
END $$;
