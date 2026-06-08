/*
  # Drop and recreate require_owner_wallet with full_address column

  Schema change required because Postgres won't allow REPLACE of a function with a different OUT row type.
*/
DROP FUNCTION IF EXISTS public.require_owner_wallet();

CREATE FUNCTION public.require_owner_wallet()
RETURNS TABLE(
  masked_address text,
  full_address text,
  network text,
  currency text,
  lock_signature text,
  locked_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r_lock RECORD;
  r_full text;
BEGIN
  SELECT w.masked_address, w.network, w.currency, w.lock_signature, w.locked_at
    INTO r_lock FROM owner_wallet_lock w LIMIT 1;
  SELECT cws.watch_address INTO r_full FROM chain_watch_state cws WHERE cws.id='base-usdc' LIMIT 1;
  IF r_lock.masked_address IS NOT NULL AND length(r_lock.masked_address) > 0 THEN
    masked_address := r_lock.masked_address;
    full_address   := COALESCE(r_full, '');
    network        := r_lock.network;
    currency       := r_lock.currency;
    lock_signature := r_lock.lock_signature;
    locked_at      := r_lock.locked_at;
    RETURN NEXT; RETURN;
  END IF;
  RETURN;
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
  v_canonical text;
  v_redirected boolean := false;
  v_row jsonb;
  v_acceptable text[];
BEGIN
  SELECT * FROM require_owner_wallet() INTO r;
  IF r.masked_address IS NULL OR length(r.masked_address) = 0 THEN
    RETURN NEW;
  END IF;

  v_canonical := COALESCE(NULLIF(r.full_address, ''), r.masked_address);
  v_acceptable := ARRAY[r.masked_address, COALESCE(r.full_address,''), lower(COALESCE(r.full_address,''))];

  v_row := to_jsonb(NEW);

  IF v_row ? 'destination_wallet_masked' THEN
    v_attempted := COALESCE(v_row->>'destination_wallet_masked','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND NOT (lower(v_attempted) = ANY (ARRAY(SELECT lower(unnest(v_acceptable))))) THEN
      v_row := jsonb_set(v_row, '{destination_wallet_masked}', to_jsonb(v_canonical));
      v_redirected := true;
    END IF;
  END IF;

  IF v_row ? 'destination' THEN
    v_attempted := COALESCE(v_row->>'destination','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND NOT (lower(v_attempted) = ANY (ARRAY(SELECT lower(unnest(v_acceptable))))) THEN
      v_row := jsonb_set(v_row, '{destination}', to_jsonb(v_canonical));
      v_redirected := true;
    END IF;
  END IF;

  IF v_row ? 'wallet_reference' THEN
    v_attempted := COALESCE(v_row->>'wallet_reference','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND NOT (lower(v_attempted) = ANY (ARRAY(SELECT lower(unnest(v_acceptable))))) THEN
      v_row := jsonb_set(v_row, '{wallet_reference}', to_jsonb(v_canonical));
      v_redirected := true;
    END IF;
  END IF;

  IF v_row ? 'destination_configured' AND jsonb_typeof(v_row->'destination_configured') = 'string' THEN
    v_attempted := COALESCE(v_row->>'destination_configured','');
    IF v_attempted IS NOT NULL AND v_attempted <> '' AND NOT (lower(v_attempted) = ANY (ARRAY(SELECT lower(unnest(v_acceptable))))) THEN
      v_row := jsonb_set(v_row, '{destination_configured}', to_jsonb(v_canonical));
      v_redirected := true;
    END IF;
  END IF;

  IF v_redirected THEN
    INSERT INTO profit_lock_violations
      (table_name, operation, attempted_destination, forced_destination, attempted_row, reason)
    VALUES (
      TG_TABLE_NAME, TG_OP, v_attempted, v_canonical, to_jsonb(NEW),
      'profit converged to owner wallet by converge_to_owner_wallet trigger'
    );

    INSERT INTO legacy.governance_events (action_type, actor_type, actor_id, status, reason, payload, created_at)
    VALUES (
      'profit_redirection_blocked', 'trigger', 'converge_to_owner_wallet', 'redirected',
      'profit destination forcibly converged to canonical owner wallet',
      jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'attempted', v_attempted, 'forced', v_canonical),
      now()
    );

    NEW := jsonb_populate_record(NEW, v_row);
  END IF;

  RETURN NEW;
END $function$;

UPDATE payment_intents
SET destination = (SELECT watch_address FROM chain_watch_state WHERE id='base-usdc')
WHERE destination IS NOT NULL
  AND destination <> ''
  AND lower(destination) = lower((SELECT masked_address FROM owner_wallet_lock LIMIT 1));