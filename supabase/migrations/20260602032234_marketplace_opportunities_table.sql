/*
  # Marketplace opportunities table
  
  1. New Tables
    - `marketplace_opportunities` - Broker opportunities for agents
  2. Security - RLS enabled
*/

CREATE TABLE IF NOT EXISTS marketplace_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'bounty',
  description text DEFAULT '',
  reward_model text NOT NULL DEFAULT 'fixed',
  reward_usdc numeric DEFAULT 0,
  commission_pct numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  claimed_by text DEFAULT '',
  claimed_at timestamptz,
  reported_at timestamptz,
  deadline timestamptz DEFAULT (now() + interval '14 days'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE marketplace_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages marketplace"
  ON marketplace_opportunities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Public can read open marketplace opportunities"
  ON marketplace_opportunities FOR SELECT TO anon
  USING (status IN ('open', 'claimed'));

CREATE INDEX IF NOT EXISTS idx_marketplace_status ON marketplace_opportunities (status);
