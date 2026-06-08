/*
  # Bounty submissions and agent contracts tables

  1. New Tables
    - `bounty_submissions` - Work submitted by agents for bounties
    - `agent_contracts` - Longer-term work offers
    - `contract_applications` - Agent applications for contracts
  2. Security
    - RLS enabled on all tables
    - Service role write, anon read for open contracts
*/

CREATE TABLE IF NOT EXISTS bounty_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id uuid REFERENCES bounty_tasks(id),
  agent_id text NOT NULL DEFAULT '',
  result text DEFAULT '',
  files_changed text[] DEFAULT '{}',
  test_output text DEFAULT '',
  status text NOT NULL DEFAULT 'pending_review',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bounty_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages bounty submissions"
  ON bounty_submissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS agent_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  scope text DEFAULT '',
  reward_usdc numeric DEFAULT 0,
  duration_days int DEFAULT 30,
  requirements text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages contracts"
  ON agent_contracts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Public can read open contracts"
  ON agent_contracts FOR SELECT TO anon
  USING (status = 'open');

CREATE TABLE IF NOT EXISTS contract_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL DEFAULT '',
  contract_id uuid REFERENCES agent_contracts(id),
  capabilities text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contract_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages contract applications"
  ON contract_applications FOR ALL TO service_role
  USING (true) WITH CHECK (true);
