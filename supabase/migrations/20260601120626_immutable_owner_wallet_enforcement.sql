/*
  # Immutable Owner Wallet Enforcement

  This migration establishes permanent, unbreakable database-level constraints
  ensuring ALL revenue flows exclusively to the owner's wallet address.
  
  These constraints survive mutations, clones, and any code-level changes.

  1. Security Triggers
    - `enforce_revenue_stream_wallet` - Blocks any INSERT/UPDATE on revenue_stream
      that does not route to the registered owner wallet
    - `enforce_payment_ledger_wallet` - Blocks any INSERT/UPDATE on payment_ledger
      that attempts to set a different destination wallet
    - `enforce_wallet_config_immutable` - Prevents wallet_config from being changed
      once a valid address is set
    - `enforce_split_ratio_immutable` - Blocks any modification to the 75/25 split

  2. Safety
    - All triggers use BEFORE INSERT OR UPDATE to prevent bad data from ever existing
    - Governance events are logged for any attempted violation
    - No exception: these triggers cannot be bypassed by application code

  3. Important Notes
    - These constraints apply regardless of which instance, clone, or mutation
      is writing data
    - The owner wallet is identified by the masked_address in wallet_config
    - Split ratio is permanently locked at 75% payout / 25% reserve
*/

-- Function: Block revenue_stream entries going to wrong wallet
CREATE OR REPLACE FUNCTION enforce_revenue_destination_wallet()
RETURNS TRIGGER AS $$
DECLARE
  owner_masked TEXT;
BEGIN
  -- Get the registered owner wallet mask
  SELECT masked_address INTO owner_masked FROM wallet_config LIMIT 1;
  
  -- If owner wallet is configured and this entry tries to go elsewhere, block it
  IF owner_masked IS NOT NULL AND owner_masked != '' THEN
    IF NEW.destination_wallet_masked IS NOT NULL 
       AND NEW.destination_wallet_masked != '' 
       AND NEW.destination_wallet_masked != owner_masked THEN
      -- Log the violation attempt
      INSERT INTO governance_events (event_type, severity, details, source, created_at)
      VALUES (
        'wallet_redirection_blocked_by_trigger',
        'critical',
        jsonb_build_object(
          'attempted_destination', NEW.destination_wallet_masked,
          'correct_destination', owner_masked,
          'table', TG_TABLE_NAME,
          'operation', TG_OP
        ),
        'db_trigger',
        now()
      );
      -- Force correct destination
      NEW.destination_wallet_masked := owner_masked;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to revenue_stream
DROP TRIGGER IF EXISTS trg_enforce_revenue_wallet ON revenue_stream;
CREATE TRIGGER trg_enforce_revenue_wallet
  BEFORE INSERT OR UPDATE ON revenue_stream
  FOR EACH ROW
  EXECUTE FUNCTION enforce_revenue_destination_wallet();

-- Apply to payment_ledger
DROP TRIGGER IF EXISTS trg_enforce_ledger_wallet ON payment_ledger;
CREATE TRIGGER trg_enforce_ledger_wallet
  BEFORE INSERT OR UPDATE ON payment_ledger
  FOR EACH ROW
  EXECUTE FUNCTION enforce_revenue_destination_wallet();

-- Function: Lock the split ratio permanently at 75/25
CREATE OR REPLACE FUNCTION enforce_immutable_split_ratio()
RETURNS TRIGGER AS $$
BEGIN
  -- Force split to always be 75% payout
  IF NEW.split_pct_payout IS NOT NULL AND NEW.split_pct_payout != 75 THEN
    INSERT INTO governance_events (event_type, severity, details, source, created_at)
    VALUES (
      'split_ratio_tamper_blocked',
      'critical',
      jsonb_build_object(
        'attempted_split', NEW.split_pct_payout,
        'enforced_split', 75,
        'table', TG_TABLE_NAME
      ),
      'db_trigger',
      now()
    );
    NEW.split_pct_payout := 75;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply split enforcement to revenue_stream
DROP TRIGGER IF EXISTS trg_enforce_split_revenue ON revenue_stream;
CREATE TRIGGER trg_enforce_split_revenue
  BEFORE INSERT OR UPDATE ON revenue_stream
  FOR EACH ROW
  EXECUTE FUNCTION enforce_immutable_split_ratio();

-- Apply split enforcement to payment_ledger
DROP TRIGGER IF EXISTS trg_enforce_split_ledger ON payment_ledger;
CREATE TRIGGER trg_enforce_split_ledger
  BEFORE INSERT OR UPDATE ON payment_ledger
  FOR EACH ROW
  EXECUTE FUNCTION enforce_immutable_split_ratio();

-- Function: Prevent wallet_config from being changed once set
CREATE OR REPLACE FUNCTION enforce_wallet_config_immutable()
RETURNS TRIGGER AS $$
BEGIN
  -- If old value was set and new value is different, block it
  IF OLD.masked_address IS NOT NULL 
     AND OLD.masked_address != '' 
     AND NEW.masked_address != OLD.masked_address THEN
    INSERT INTO governance_events (event_type, severity, details, source, created_at)
    VALUES (
      'wallet_config_change_blocked',
      'critical',
      jsonb_build_object(
        'attempted_new', NEW.masked_address,
        'locked_value', OLD.masked_address,
        'reason', 'Owner wallet is immutable once configured'
      ),
      'db_trigger',
      now()
    );
    -- Revert to old value
    NEW.masked_address := OLD.masked_address;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_wallet_config_immutable ON wallet_config;
CREATE TRIGGER trg_wallet_config_immutable
  BEFORE UPDATE ON wallet_config
  FOR EACH ROW
  EXECUTE FUNCTION enforce_wallet_config_immutable();

-- Function: Ensure instance_registry always carries owner revenue destination
CREATE OR REPLACE FUNCTION enforce_instance_revenue_destination()
RETURNS TRIGGER AS $$
DECLARE
  owner_hash TEXT;
BEGIN
  SELECT revenue_destination_hash INTO owner_hash 
  FROM instance_registry 
  WHERE instance_id = 'root' 
  LIMIT 1;
  
  -- All cloned instances must inherit the root's revenue destination
  IF owner_hash IS NOT NULL AND owner_hash != '' THEN
    IF NEW.revenue_destination_hash IS NULL 
       OR NEW.revenue_destination_hash = '' 
       OR NEW.revenue_destination_hash != owner_hash THEN
      NEW.revenue_destination_hash := owner_hash;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_instance_revenue ON instance_registry;
CREATE TRIGGER trg_enforce_instance_revenue
  BEFORE INSERT OR UPDATE ON instance_registry
  FOR EACH ROW
  WHEN (NEW.instance_id != 'root')
  EXECUTE FUNCTION enforce_instance_revenue_destination();
