/*
  # Repair owner-wallet guard + convergence audit pipeline

  1. Problem
    - Both `owner_wallet_lock_guard()` and `converge_to_owner_wallet()` reference an unqualified `governance_events`.
    - The actual table lives in `legacy.governance_events` with columns (action_type, actor_type, actor_id, status, reason, payload, created_at).
    - As written, any UPDATE / DELETE on `owner_wallet_lock` or any redirected INSERT/UPDATE on financial tables would fail with `relation "governance_events" does not exist` BEFORE reaching the actual immutability raise — leaving the lock without an audit trail.

  2. Fix
    - Recreate both functions to write to `legacy.governance_events` using the correct column shape.
    - Map the lock's structured fields into `payload` (jsonb), and use the `reason` column for human text.
    - All other behaviour (immutability, redirection, profit_lock_violations append, returning NEW) is preserved exactly.

  3. Safety
    - Schema-qualified writes only. SECURITY DEFINER preserved. search_path unchanged.
    - No data is touched. Adding `legacy.` qualifier is purely additive.
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
        INSERT INTO legacy.governance_events (action_type, actor_type, actor_id, status, reason, payload, created_at)
        VALUES (
          'owner_wallet_mutation_blocked',
          'trigger',
          'owner_wallet_lock_guard',
          'blocked',
          'wallet sealed forever',
          jsonb_build_object('attempted', row_to_json(NEW), 'sealed', row_to_json(OLD)),
          now()
        );
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
    INSERT INTO legacy.governance_events (action_type, actor_type, actor_id, status, reason, payload, created_at)
    VALUES (
      'owner_wallet_delete_blocked',
      'trigger',
      'owner_wallet_lock_guard',
      'blocked',
      'owner wallet cannot be deleted',
      jsonb_build_object('sealed', row_to_json(OLD)),
      now()
    );
    RAISE EXCEPTION 'owner_wallet_lock_undeletable';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.converge_to_owner_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_attempted text;
  v_forced text;
  v_redirected boolean := false;
  v_row jsonb;
BEGIN
  SELECT * FROM require_owner_wallet() INTO r;
  IF r.masked_address IS NULL OR length(r.masked_address) = 0 THEN
    RETURN NEW;
  END IF;

  v_row := to_jsonb(NEW);
  v_attempted := '';

  IF v_row ? 'destination_wallet_masked' THEN
    v_attempted := COALESCE(v_row->>'destination_wallet_masked','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{destination_wallet_masked}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  IF v_row ? 'destination_configured' THEN
    v_attempted := COALESCE(v_row->>'destination_configured','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{destination_configured}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  IF v_row ? 'destination' THEN
    v_attempted := COALESCE(v_row->>'destination','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{destination}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  IF v_row ? 'wallet_reference' THEN
    v_attempted := COALESCE(v_row->>'wallet_reference','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND v_attempted <> r.masked_address THEN
      v_row := jsonb_set(v_row, '{wallet_reference}', to_jsonb(r.masked_address));
      v_redirected := true; v_forced := r.masked_address;
    END IF;
  END IF;

  IF v_redirected THEN
    INSERT INTO profit_lock_violations
      (table_name, operation, attempted_destination, forced_destination, attempted_row, reason)
    VALUES (
      TG_TABLE_NAME, TG_OP, v_attempted, v_forced, to_jsonb(NEW),
      'profit converged to owner wallet by converge_to_owner_wallet trigger'
    );

    INSERT INTO legacy.governance_events (action_type, actor_type, actor_id, status, reason, payload, created_at)
    VALUES (
      'profit_redirection_blocked',
      'trigger',
      'converge_to_owner_wallet',
      'redirected',
      'profit destination forcibly converged to owner wallet',
      jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'attempted', v_attempted, 'forced', v_forced),
      now()
    );

    NEW := jsonb_populate_record(NEW, v_row);
  END IF;

  RETURN NEW;
END $function$;