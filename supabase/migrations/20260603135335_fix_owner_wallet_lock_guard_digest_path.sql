/*
  # Fix owner_wallet_lock_guard digest function resolution

  1. Problem
    - `owner_wallet_lock_guard()` has a locked `search_path` set to `'public', 'pg_temp'`.
    - `pgcrypto` is installed in the `extensions` schema, so `digest()` is unresolvable from inside the trigger.
    - This blocks the very first INSERT into `owner_wallet_lock`, preventing the wallet from being sealed.

  2. Fix
    - Recreate `owner_wallet_lock_guard()` with the same logic, but call `extensions.digest(...)` with a fully-qualified schema reference.
    - Keep `SECURITY DEFINER` and the strict `search_path` (no widening) so we don't loosen security guarantees.

  3. Safety
    - Pure logic fix. No data is touched. No DROP/DELETE.
    - All immutability and append-only audit semantics are preserved exactly.
*/

CREATE OR REPLACE FUNCTION public.owner_wallet_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE existing_count int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO existing_count FROM owner_wallet_lock;
    IF existing_count >= 1 THEN
      RAISE EXCEPTION 'owner_wallet_lock_already_sealed';
    END IF;
    NEW.lock_signature := encode(
      extensions.digest(
        NEW.masked_address || ':' || NEW.network || ':' || NEW.currency || ':' || NEW.locked_at::text,
        'sha256'
      ),
      'hex'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.lock_signature IS NOT NULL AND OLD.lock_signature <> '' THEN
      IF NEW.masked_address <> OLD.masked_address
        OR NEW.full_address_hash <> OLD.full_address_hash
        OR NEW.network <> OLD.network
        OR NEW.currency <> OLD.currency
        OR NEW.lock_signature <> OLD.lock_signature
        OR NEW.locked_at <> OLD.locked_at THEN
        INSERT INTO governance_events (event_type, severity, details, source, created_at)
        VALUES ('owner_wallet_mutation_blocked', 'critical',
          jsonb_build_object('attempted', row_to_json(NEW), 'sealed', row_to_json(OLD), 'reason', 'wallet sealed forever'),
          'owner_wallet_lock_guard', now());
        RAISE EXCEPTION 'owner_wallet_lock_immutable';
      END IF;
      NEW.masked_address := OLD.masked_address;
      NEW.full_address_hash := OLD.full_address_hash;
      NEW.network := OLD.network;
      NEW.currency := OLD.currency;
      NEW.lock_signature := OLD.lock_signature;
      NEW.locked_at := OLD.locked_at;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO governance_events (event_type, severity, details, source, created_at)
    VALUES ('owner_wallet_delete_blocked', 'critical',
      jsonb_build_object('sealed', row_to_json(OLD), 'reason','owner wallet cannot be deleted'),
      'owner_wallet_lock_guard', now());
    RAISE EXCEPTION 'owner_wallet_lock_undeletable';
  END IF;
  RETURN NEW;
END $function$;