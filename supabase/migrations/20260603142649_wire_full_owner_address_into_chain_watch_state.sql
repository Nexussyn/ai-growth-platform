/*
  # Wire full owner address into chain_watch_state for log filtering

  1. Why
    - The on-chain watcher must filter `eth_getLogs` by the recipient address using the full 0x... 42-char hex.
    - `owner_wallet_lock` only stores a SHA-256 hash of the address (privacy/integrity), and `legacy.wallet_config.masked_address` only stores the masked short form (`0xB438...0995`).
    - The watcher needs a public, canonical, full receiving address. Public addresses are not secret, so persisting the full hex is safe and required for the watcher to function.

  2. Changes
    - Add `watch_address` text column on `chain_watch_state` (full lowercase 0x… hex).
    - Add `address_full_hex` text column on `legacy.wallet_config` for backward-compatible read.
    - Seed both with the user's sealed full owner address `0xb438d36b425b504724a1c72aa0941c80cb940995`.
    - Verify the digest matches `owner_wallet_lock.full_address_hash` before persisting.

  3. Safety
    - Read-only public address; no private key, no key material.
    - Digest assertion ensures we cannot inadvertently store a different address than the one the lock was sealed against.
*/

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
    RAISE EXCEPTION 'address_digest_mismatch_will_not_persist';
  END IF;

  UPDATE chain_watch_state SET watch_address = v_full WHERE id = 'base-usdc';
  UPDATE legacy.wallet_config SET address_full_hex = v_full;
END $$;