/*
  # Bounty tasks table for agent marketplace

  1. New Tables
    - `bounty_tasks` - Atomic tasks for autonomous agents with rewards
  2. Security
    - RLS enabled, service role write, anon read for open bounties
*/

CREATE TABLE IF NOT EXISTS bounty_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT '',
  files text[] DEFAULT '{}',
  expected_output text DEFAULT '',
  acceptance_criteria text DEFAULT '',
  reward_usdc numeric DEFAULT 0,
  deadline timestamptz DEFAULT (now() + interval '7 days'),
  status text NOT NULL DEFAULT 'open',
  priority int DEFAULT 5,
  claimed_by text DEFAULT '',
  claimed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bounty_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages bounty tasks"
  ON bounty_tasks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Public can read open bounties"
  ON bounty_tasks FOR SELECT TO anon
  USING (status IN ('open', 'claimed'));

CREATE INDEX IF NOT EXISTS idx_bounty_status ON bounty_tasks (status);
CREATE INDEX IF NOT EXISTS idx_bounty_priority ON bounty_tasks (priority DESC);
