/*
  # Open-World Agent Runtime Schema

  1. New Tables
    - `runtime_events`
      - `id` (uuid, primary key)
      - `event_type` (text) - discovery_found, api_request_success, contract_created, etc.
      - `source` (text) - which worker/layer produced the event
      - `target` (text) - external URL or system targeted
      - `correlation_id` (uuid) - links related events together
      - `status` (text) - pending, success, failed, error, blocked
      - `payload_summary` (text) - truncated response or description
      - `raw_response_hash` (text) - hash of full response body
      - `retry_count` (integer) - number of retries attempted
      - `payout_status` (text, nullable) - for financial events
      - `wallet_reference` (text, nullable) - masked wallet or tx ref
      - `error_message` (text, nullable)
      - `created_at` (timestamptz)

    - `capability_registry`
      - `id` (uuid, primary key)
      - `capability` (text, unique) - web_search, api_call, telegram_notify, etc.
      - `enabled` (boolean)
      - `last_success_at` (timestamptz)
      - `last_failure_at` (timestamptz)
      - `total_calls` (integer)
      - `total_successes` (integer)
      - `total_failures` (integer)
      - `created_at` (timestamptz)

    - `domain_allowlist`
      - `id` (uuid, primary key)
      - `domain` (text, unique) - allowed external domain
      - `category` (text) - notification, search, marketplace, etc.
      - `enabled` (boolean)
      - `rate_limit_per_min` (integer) - max requests per minute
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - service_role for all operations
    - authenticated for read-only access

  3. Notes
    - Domain allowlist controls which external APIs the system can reach
    - Capability registry tracks which actions are available and their success rates
    - Runtime events are the single source of truth for all system activity
    - No event is displayed in the UI unless it exists in runtime_events
*/

CREATE TABLE IF NOT EXISTS runtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  target text NOT NULL DEFAULT '',
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  payload_summary text NOT NULL DEFAULT '',
  raw_response_hash text,
  retry_count integer NOT NULL DEFAULT 0,
  payout_status text,
  wallet_reference text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'runtime_events' AND policyname = 'Service role manages runtime events') THEN
    CREATE POLICY "Service role manages runtime events" ON runtime_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'runtime_events' AND policyname = 'Authenticated can read runtime events') THEN
    CREATE POLICY "Authenticated can read runtime events" ON runtime_events FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_runtime_events_type ON runtime_events(event_type);
CREATE INDEX IF NOT EXISTS idx_runtime_events_status ON runtime_events(status);
CREATE INDEX IF NOT EXISTS idx_runtime_events_created ON runtime_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_events_correlation ON runtime_events(correlation_id);

CREATE TABLE IF NOT EXISTS capability_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  total_calls integer NOT NULL DEFAULT 0,
  total_successes integer NOT NULL DEFAULT 0,
  total_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE capability_registry ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'capability_registry' AND policyname = 'Service role manages capabilities') THEN
    CREATE POLICY "Service role manages capabilities" ON capability_registry FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'capability_registry' AND policyname = 'Authenticated can read capabilities') THEN
    CREATE POLICY "Authenticated can read capabilities" ON capability_registry FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO capability_registry (capability) VALUES
  ('web_search'), ('web_scrape'), ('api_call'), ('webhook_send'),
  ('telegram_notify'), ('recruit_agent'), ('create_contract'),
  ('submit_bid'), ('request_payout'), ('verify_settlement'), ('reconcile_ledger')
ON CONFLICT (capability) DO NOTHING;

CREATE TABLE IF NOT EXISTS domain_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  category text NOT NULL DEFAULT 'general',
  enabled boolean NOT NULL DEFAULT true,
  rate_limit_per_min integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE domain_allowlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'domain_allowlist' AND policyname = 'Service role manages allowlist') THEN
    CREATE POLICY "Service role manages allowlist" ON domain_allowlist FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'domain_allowlist' AND policyname = 'Authenticated can read allowlist') THEN
    CREATE POLICY "Authenticated can read allowlist" ON domain_allowlist FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO domain_allowlist (domain, category, rate_limit_per_min) VALUES
  ('api.telegram.org', 'notification', 30),
  ('serpapi.com', 'search', 5),
  ('api.github.com', 'marketplace', 10),
  ('huggingface.co', 'ai_marketplace', 5),
  ('replicate.com', 'ai_marketplace', 5),
  ('api.openai.com', 'ai_api', 5),
  ('api.anthropic.com', 'ai_api', 5),
  ('api.coingecko.com', 'defi', 10),
  ('basescan.org', 'blockchain', 10),
  ('api.dexscreener.com', 'defi', 10),
  ('httpbin.org', 'testing', 20)
ON CONFLICT (domain) DO NOTHING;
