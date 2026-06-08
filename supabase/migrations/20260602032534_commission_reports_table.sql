/*
  # Commission reports table for broker model
*/

CREATE TABLE IF NOT EXISTS commission_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL DEFAULT '',
  opportunity_id uuid,
  outcome text DEFAULT '',
  evidence text DEFAULT '',
  conversion_value_usdc numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_verification',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE commission_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages commission reports"
  ON commission_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);
