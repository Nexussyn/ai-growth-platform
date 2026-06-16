-- BUG CRITIQUE corrige : le trigger converge_to_owner_wallet (attache a 7 tables
-- dont onchain_payments et payment_intents) appelait require_owner_wallet() qui
-- N'EXISTAIT PAS -> tout INSERT sur ces tables echouait, bloquant l'encaissement.
-- On (re)cree la fonction depuis immutable_config (jamais code en dur).
CREATE OR REPLACE FUNCTION public.require_owner_wallet()
RETURNS TABLE(masked_address text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_wallet text;
BEGIN
  SELECT lower(config_value) INTO v_wallet FROM immutable_config WHERE config_key='owner_settlement_wallet' LIMIT 1;
  IF v_wallet IS NULL OR length(v_wallet)=0 THEN
    SELECT lower(wc.masked_address) INTO v_wallet FROM wallet_config wc WHERE wc.masked_address IS NOT NULL LIMIT 1;
  END IF;
  RETURN QUERY SELECT v_wallet;
END; $function$;

-- Tache recurrente de scoring/validation (cron 145), decalee de 15 min vs le scout.
-- SELECT cron.schedule('opportunity_scorer', '15,45 * * * *', ... runtime-opportunity-scorer ...);
