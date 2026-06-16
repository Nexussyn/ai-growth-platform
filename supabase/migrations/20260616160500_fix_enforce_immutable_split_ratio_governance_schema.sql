-- Correction d'un bug : enforce_immutable_split_ratio inserait dans governance_events
-- avec des colonnes inexistantes (event_type/severity/details/source) -> echec si declenche.
-- On aligne sur le vrai schema (action_type/actor_type/actor_id/status/reason/payload).
CREATE OR REPLACE FUNCTION public.enforce_immutable_split_ratio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.split_pct_payout IS NOT NULL AND NEW.split_pct_payout != 75 THEN
    INSERT INTO governance_events (action_type, actor_type, actor_id, status, reason, payload, created_at)
    VALUES ('split_ratio_tamper_blocked','db_trigger', TG_TABLE_NAME, 'critical',
      'Tentative de modification du split payout corrigee a 75',
      jsonb_build_object('attempted_split', NEW.split_pct_payout, 'enforced_split', 75, 'table', TG_TABLE_NAME), now());
    NEW.split_pct_payout := 75;
  END IF;
  RETURN NEW;
END; $function$;
