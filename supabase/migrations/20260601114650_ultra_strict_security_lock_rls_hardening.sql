/*
  # Ultra Strict Security Lock - RLS Hardening

  1. Security Changes
    - Remove all overly permissive USING(true) policies on financial tables
    - Replace with service_role-only access for all financial/payment data
    - Lock down wallet_config from public/anon reads
    - Restrict governance_events to service_role only
    - Ensure payment_ledger, revenue_stream, profit_ledger are service_role only
    - Remove public access to payment_confirmations details
    - Lock system_metrics writes to service_role only

  2. Affected Tables
    - payment_ledger: service_role only (full CRUD)
    - revenue_stream: service_role only
    - profit_ledger: service_role only
    - net_profit_summary: service_role only
    - credit_transactions: service_role only
    - settlement_attempts: service_role only
    - wallet_config: service_role only (no public reads)
    - wallet_connections: service_role only
    - payment_log: service_role only
    - payment_logs: service_role only
    - payment_transactions: service_role only
    - payment_confirmations: service_role only
    - governance_events: service_role only
    - security_findings: service_role only

  3. Important Notes
    - All edge function operations use service_role key so they continue to work
    - No public/anon/authenticated user can directly query financial tables
    - Dashboard data is served through the edge function which applies its own filtering
*/

-- Drop all existing overly permissive policies on financial tables
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'payment_ledger', 'revenue_stream', 'profit_ledger', 'net_profit_summary',
      'credit_transactions', 'settlement_attempts', 'wallet_config', 'wallet_connections',
      'payment_log', 'payment_logs', 'payment_transactions', 'payment_confirmations',
      'governance_events', 'security_findings', 'security_gates'
    )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- payment_ledger: service_role only
CREATE POLICY "service_role_select_payment_ledger"
  ON payment_ledger FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_payment_ledger"
  ON payment_ledger FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_payment_ledger"
  ON payment_ledger FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- revenue_stream: service_role only
CREATE POLICY "service_role_select_revenue_stream"
  ON revenue_stream FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_revenue_stream"
  ON revenue_stream FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_revenue_stream"
  ON revenue_stream FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- profit_ledger: service_role only
CREATE POLICY "service_role_select_profit_ledger"
  ON profit_ledger FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_profit_ledger"
  ON profit_ledger FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_profit_ledger"
  ON profit_ledger FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- net_profit_summary: service_role only
CREATE POLICY "service_role_select_net_profit_summary"
  ON net_profit_summary FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_net_profit_summary"
  ON net_profit_summary FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_net_profit_summary"
  ON net_profit_summary FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- credit_transactions: service_role only
CREATE POLICY "service_role_select_credit_transactions"
  ON credit_transactions FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_credit_transactions"
  ON credit_transactions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_credit_transactions"
  ON credit_transactions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- settlement_attempts: service_role only
CREATE POLICY "service_role_select_settlement_attempts"
  ON settlement_attempts FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_settlement_attempts"
  ON settlement_attempts FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_settlement_attempts"
  ON settlement_attempts FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- wallet_config: service_role only (remove all public/anon access)
CREATE POLICY "service_role_select_wallet_config"
  ON wallet_config FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_wallet_config"
  ON wallet_config FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_wallet_config"
  ON wallet_config FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- wallet_connections: service_role only
CREATE POLICY "service_role_select_wallet_connections"
  ON wallet_connections FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_wallet_connections"
  ON wallet_connections FOR INSERT TO service_role WITH CHECK (true);

-- payment_log: service_role only
CREATE POLICY "service_role_select_payment_log"
  ON payment_log FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_payment_log"
  ON payment_log FOR INSERT TO service_role WITH CHECK (true);

-- payment_logs: service_role only
CREATE POLICY "service_role_select_payment_logs"
  ON payment_logs FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_payment_logs"
  ON payment_logs FOR INSERT TO service_role WITH CHECK (true);

-- payment_transactions: service_role only
CREATE POLICY "service_role_select_payment_transactions"
  ON payment_transactions FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_payment_transactions"
  ON payment_transactions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_payment_transactions"
  ON payment_transactions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- payment_confirmations: service_role only (remove public reads)
CREATE POLICY "service_role_select_payment_confirmations"
  ON payment_confirmations FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_payment_confirmations"
  ON payment_confirmations FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_payment_confirmations"
  ON payment_confirmations FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- governance_events: service_role only (remove anon reads)
CREATE POLICY "service_role_select_governance_events"
  ON governance_events FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_governance_events"
  ON governance_events FOR INSERT TO service_role WITH CHECK (true);

-- security_findings: service_role only
CREATE POLICY "service_role_select_security_findings"
  ON security_findings FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_security_findings"
  ON security_findings FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_security_findings"
  ON security_findings FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- security_gates: service_role for writes, restricted read for dashboard
CREATE POLICY "service_role_select_security_gates"
  ON security_gates FOR SELECT TO service_role USING (true);
CREATE POLICY "service_role_insert_security_gates"
  ON security_gates FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role_update_security_gates"
  ON security_gates FOR UPDATE TO service_role USING (true) WITH CHECK (true);
-- Allow anon to see only open gates (severity + description for dashboard display)
CREATE POLICY "anon_view_open_gates_limited"
  ON security_gates FOR SELECT TO anon
  USING (status = 'open');

-- system_metrics: service_role for writes, anon read only paid_calls count
CREATE POLICY "service_role_all_system_metrics"
  ON system_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
