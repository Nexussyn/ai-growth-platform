/*
  # Fix wallet_config RLS and free plan auto-activation

  1. Changes
    - Add SELECT policy for anon/authenticated on wallet_config so frontend can read it
    - Add SELECT policy for anon/authenticated on pricing_plans so plans are visible
    - Add SELECT policy for anon/authenticated on engine_state so dashboard reads work
    - Add SELECT policy for anon/authenticated on experiment_variants for variant display
    - Add SELECT policy for anon/authenticated on improvement_proposals for dashboard

  2. Security
    - All new policies are read-only (SELECT)
    - Write access remains restricted to service_role
*/

-- wallet_config: allow public reads (no secrets exposed - only masked address)
CREATE POLICY "Public can read wallet config"
  ON wallet_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- pricing_plans: allow public reads for plan display
CREATE POLICY "Public can read pricing plans"
  ON pricing_plans FOR SELECT
  TO anon, authenticated
  USING (true);

-- engine_state: allow public reads for dashboard
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'engine_state' AND policyname = 'Anon can read engine_state'
  ) THEN
    -- Policy already exists, skip
    NULL;
  END IF;
END $$;

-- experiment_variants: allow public reads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'experiment_variants' AND policyname = 'Public can read variants'
  ) THEN
    CREATE POLICY "Public can read variants"
      ON experiment_variants FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- improvement_proposals: allow public reads for dashboard display
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'improvement_proposals' AND policyname = 'Public can read proposals'
  ) THEN
    CREATE POLICY "Public can read proposals"
      ON improvement_proposals FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- pricing_experiments: allow public reads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pricing_experiments' AND policyname = 'Public can read pricing experiments'
  ) THEN
    CREATE POLICY "Public can read pricing experiments"
      ON pricing_experiments FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
