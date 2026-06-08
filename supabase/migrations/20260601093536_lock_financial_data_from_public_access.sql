/*
  # Lock Financial Data from Public Access

  1. Security Changes
    - Remove anon SELECT policy on `revenue_ledger` (was exposing confirmed revenue amounts)
    - Remove public SELECT policy on `system_metrics` (was exposing gross/payout/reserve totals)
    - Add service_role-only SELECT policy on `system_metrics`

  2. Rationale
    - Revenue totals, net revenue, transaction-level data must not be publicly accessible
    - Public surfaces may show only non-financial operational status
    - Financial data remains available only to the edge function (service_role)

  3. Important Notes
    - No data is modified, only access policies are changed
    - The edge function continues to have full access via service_role
    - Dashboard components have already been updated to not query this data
*/

-- Drop the anon read policy on revenue_ledger
DROP POLICY IF EXISTS "Anon can read reconciled revenue" ON revenue_ledger;

-- Drop the public read policy on system_metrics
DROP POLICY IF EXISTS "Public can read system metrics" ON system_metrics;

-- Add service_role-only read policy on system_metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'system_metrics' AND policyname = 'Service role reads system_metrics'
  ) THEN
    CREATE POLICY "Service role reads system_metrics"
      ON system_metrics
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;
