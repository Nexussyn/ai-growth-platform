/*
  # Part 2: Outbox, Job Queue, Delivery, Settlement, Projections, Connectors
*/
CREATE TABLE IF NOT EXISTS outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, destination text NOT NULL, payload jsonb DEFAULT '{}', status text DEFAULT 'pending', attempts integer DEFAULT 0, max_attempts integer DEFAULT 3, created_at timestamptz DEFAULT now(), processed_at timestamptz);
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outbox' AND policyname = 'Service role full access outbox') THEN CREATE POLICY "Service role full access outbox" ON outbox FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status, created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS job_queue (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_type text NOT NULL, agent text NOT NULL, payload jsonb DEFAULT '{}', status text DEFAULT 'queued', priority integer DEFAULT 0, idempotency_key text UNIQUE, locked_by text, locked_at timestamptz, timeout_ms integer DEFAULT 30000, created_at timestamptz DEFAULT now(), completed_at timestamptz);
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_queue' AND policyname = 'Service role full access job_queue') THEN CREATE POLICY "Service role full access job_queue" ON job_queue FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_queue' AND policyname = 'Authenticated read job_queue') THEN CREATE POLICY "Authenticated read job_queue" ON job_queue FOR SELECT TO authenticated USING (true); END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_jq_queued ON job_queue(priority DESC, created_at) WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS job_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL, attempt integer DEFAULT 1, status text DEFAULT 'running', started_at timestamptz DEFAULT now(), finished_at timestamptz, error_message text, response_hash text, duration_ms integer);
ALTER TABLE job_attempts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_attempts' AND policyname = 'Service role full access job_attempts') THEN CREATE POLICY "Service role full access job_attempts" ON job_attempts FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $$;

CREATE TABLE IF NOT EXISTS processed_events (idempotency_key text PRIMARY KEY, event_id uuid NOT NULL, consumer text NOT NULL, processed_at timestamptz DEFAULT now());
ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'processed_events' AND policyname = 'Service role full access processed_events') THEN CREATE POLICY "Service role full access processed_events" ON processed_events FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $$;

CREATE TABLE IF NOT EXISTS connector_state (domain text PRIMARY KEY, category text DEFAULT 'general', circuit_state text DEFAULT 'closed', consecutive_failures integer DEFAULT 0, total_requests integer DEFAULT 0, total_successes integer DEFAULT 0, total_failures integer DEFAULT 0, rate_limit_per_min integer DEFAULT 10, last_success_at timestamptz, last_failure_at timestamptz, last_error text, fallback_domain text, enabled boolean DEFAULT true, updated_at timestamptz DEFAULT now());
ALTER TABLE connector_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'connector_state' AND policyname = 'Service role full access connector_state') THEN CREATE POLICY "Service role full access connector_state" ON connector_state FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'connector_state' AND policyname = 'Authenticated read connector_state') THEN CREATE POLICY "Authenticated read connector_state" ON connector_state FOR SELECT TO authenticated USING (true); END IF; END $$;
INSERT INTO connector_state (domain, category, rate_limit_per_min) VALUES ('api.telegram.org','notification',30),('api.github.com','marketplace',10),('huggingface.co','ai_marketplace',5),('replicate.com','ai_marketplace',5),('api.coingecko.com','defi',10),('api.dexscreener.com','defi',10),('basescan.org','blockchain',10),('httpbin.org','testing',20) ON CONFLICT (domain) DO NOTHING;

CREATE TABLE IF NOT EXISTS delivery_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), correlation_id uuid NOT NULL, agent text NOT NULL, destination text NOT NULL, method text DEFAULT 'GET', status_code integer, response_hash text, response_preview text, idempotency_key text, attempt integer DEFAULT 1, success boolean DEFAULT false, error_message text, created_at timestamptz DEFAULT now());
ALTER TABLE delivery_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'delivery_log' AND policyname = 'Service role full access delivery_log') THEN CREATE POLICY "Service role full access delivery_log" ON delivery_log FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'delivery_log' AND policyname = 'Authenticated read delivery_log') THEN CREATE POLICY "Authenticated read delivery_log" ON delivery_log FOR SELECT TO authenticated USING (true); END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_dl_created ON delivery_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dl_success ON delivery_log(success, created_at DESC);

CREATE TABLE IF NOT EXISTS settlement_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), correlation_id uuid NOT NULL, settlement_type text NOT NULL, amount_usd numeric(12,6) DEFAULT 0, wallet_reference text, tx_hash text, status text DEFAULT 'pending', verified boolean DEFAULT false, created_at timestamptz DEFAULT now(), settled_at timestamptz);
ALTER TABLE settlement_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settlement_log' AND policyname = 'Service role full access settlement_log') THEN CREATE POLICY "Service role full access settlement_log" ON settlement_log FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settlement_log' AND policyname = 'Authenticated read settlement_log') THEN CREATE POLICY "Authenticated read settlement_log" ON settlement_log FOR SELECT TO authenticated USING (true); END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_sl_status ON settlement_log(status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS projection_metrics (metric_key text PRIMARY KEY, metric_value numeric(18,6) DEFAULT 0, metadata jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
ALTER TABLE projection_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projection_metrics' AND policyname = 'Service role full access projection_metrics') THEN CREATE POLICY "Service role full access projection_metrics" ON projection_metrics FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projection_metrics' AND policyname = 'Authenticated read projection_metrics') THEN CREATE POLICY "Authenticated read projection_metrics" ON projection_metrics FOR SELECT TO authenticated USING (true); END IF; END $$;
INSERT INTO projection_metrics (metric_key, metric_value) VALUES ('total_deliveries',0),('total_successes',0),('total_failures',0),('total_blocked',0),('discoveries',0),('contracts',0),('payouts_requested',0),('payouts_received',0),('health_score',100) ON CONFLICT (metric_key) DO NOTHING;
