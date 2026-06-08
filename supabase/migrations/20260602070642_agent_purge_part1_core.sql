/*
  # Agent Purge + DB Re-Architecture (Part 1: Core Tables)
  
  Creates governed_agents and domain_events tables.
*/

CREATE TABLE IF NOT EXISTS domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  agent text NOT NULL,
  target text NOT NULL DEFAULT '',
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'created',
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'domain_events' AND policyname = 'Service role full access domain_events') THEN
    CREATE POLICY "Service role full access domain_events" ON domain_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'domain_events' AND policyname = 'Authenticated read domain_events') THEN
    CREATE POLICY "Authenticated read domain_events" ON domain_events FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_de_type ON domain_events(event_type);
CREATE INDEX IF NOT EXISTS idx_de_agent ON domain_events(agent);
CREATE INDEX IF NOT EXISTS idx_de_created ON domain_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_de_status ON domain_events(status);

CREATE TABLE IF NOT EXISTS governed_agents (
  name text PRIMARY KEY,
  role text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_active_at timestamptz,
  total_cycles integer NOT NULL DEFAULT 0,
  total_events_produced integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE governed_agents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'governed_agents' AND policyname = 'Service role full access governed_agents') THEN
    CREATE POLICY "Service role full access governed_agents" ON governed_agents FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'governed_agents' AND policyname = 'Authenticated read governed_agents') THEN
    CREATE POLICY "Authenticated read governed_agents" ON governed_agents FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
INSERT INTO governed_agents (name, role) VALUES
  ('supervisor', 'Plans, routes, approves, escalates. Never does heavy work.'),
  ('discovery', 'Finds opportunities, agents, channels, and external signals.'),
  ('outreach', 'Performs real outbound communication and contact.'),
  ('execution', 'Performs real external actions, contracts, task submissions.'),
  ('connector_health', 'Monitors integrations, retries, circuit breakers, fallbacks.'),
  ('reconciliation', 'Verifies persistence, delivery, settlement, consistency.'),
  ('visibility', 'Channel performance, suppresses dead, promotes verified.'),
  ('payout', 'Real wallet/settlement tracing only.')
ON CONFLICT (name) DO NOTHING;
