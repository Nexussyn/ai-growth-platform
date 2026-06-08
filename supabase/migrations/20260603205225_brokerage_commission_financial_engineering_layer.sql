/*
  # Agent Brokerage Commission & Financial Engineering Layer
  Fixed: guard coding_agents INSERT with IF EXISTS check
*/

-- Brokerage contracts per agent
CREATE TABLE IF NOT EXISTS brokerage_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,
  agent_type text NOT NULL DEFAULT 'coding_agent',
  commission_rate_pct numeric(5,2) NOT NULL DEFAULT 15.00,
  priority_tier int NOT NULL DEFAULT 1,
  allowed_task_kinds text[] NOT NULL DEFAULT ARRAY['code','research','financial','audit','deploy'],
  max_concurrent_tasks int NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  total_tasks_completed int NOT NULL DEFAULT 0,
  total_commission_earned_usd numeric(12,4) NOT NULL DEFAULT 0,
  reliability_score numeric(5,2) NOT NULL DEFAULT 100.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_slug, agent_type)
);

ALTER TABLE brokerage_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages brokerage_contracts"
  ON brokerage_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Brokered tasks
CREATE TABLE IF NOT EXISTS brokerage_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES brokerage_contracts(id),
  agent_slug text NOT NULL,
  client_id text NOT NULL DEFAULT 'platform',
  task_kind text NOT NULL,
  task_summary text NOT NULL,
  task_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  gross_value_usd numeric(12,4) NOT NULL DEFAULT 0,
  commission_pct numeric(5,2) NOT NULL DEFAULT 15.00,
  commission_usd numeric(12,4) NOT NULL DEFAULT 0,
  agent_net_usd numeric(12,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  quality_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brokerage_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages brokerage_tasks"
  ON brokerage_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Commission ledger (append-only)
CREATE TABLE IF NOT EXISTS brokerage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES brokerage_tasks(id),
  position_id uuid,
  entry_type text NOT NULL,
  debit_account text NOT NULL,
  credit_account text NOT NULL,
  amount_usd numeric(12,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USDC',
  memo text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brokerage_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages brokerage_ledger"
  ON brokerage_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Financial engineering positions
CREATE TABLE IF NOT EXISTS financial_engineering_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_type text NOT NULL,
  strategy_name text NOT NULL,
  protocol_slug text,
  chain text NOT NULL DEFAULT 'Base',
  asset_in text NOT NULL DEFAULT 'USDC',
  asset_out text,
  amount_deployed_usd numeric(14,4) NOT NULL DEFAULT 0,
  expected_yield_pct numeric(8,4) NOT NULL DEFAULT 0,
  realized_pnl_usd numeric(14,4) NOT NULL DEFAULT 0,
  unrealized_pnl_usd numeric(14,4) NOT NULL DEFAULT 0,
  commission_on_pnl_pct numeric(5,2) NOT NULL DEFAULT 20.00,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_score int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE financial_engineering_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages financial_positions"
  ON financial_engineering_positions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Daily stats rollup
CREATE TABLE IF NOT EXISTS brokerage_stats_daily (
  date date PRIMARY KEY,
  tasks_brokered int NOT NULL DEFAULT 0,
  tasks_completed int NOT NULL DEFAULT 0,
  gross_volume_usd numeric(14,4) NOT NULL DEFAULT 0,
  total_commission_usd numeric(14,4) NOT NULL DEFAULT 0,
  total_agent_payouts_usd numeric(14,4) NOT NULL DEFAULT 0,
  financial_pnl_usd numeric(14,4) NOT NULL DEFAULT 0,
  top_agent_slug text,
  top_agent_tasks int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brokerage_stats_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages brokerage_stats_daily"
  ON brokerage_stats_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brokerage_tasks_status ON brokerage_tasks(status);
CREATE INDEX IF NOT EXISTS idx_brokerage_tasks_agent ON brokerage_tasks(agent_slug, status);
CREATE INDEX IF NOT EXISTS idx_brokerage_ledger_task ON brokerage_ledger(task_id);
CREATE INDEX IF NOT EXISTS idx_fin_positions_status ON financial_engineering_positions(status);

-- broker_assign_task
CREATE OR REPLACE FUNCTION public.broker_assign_task(
  p_task_kind text,
  p_task_summary text,
  p_gross_value_usd numeric DEFAULT 0,
  p_client_id text DEFAULT 'platform',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_contract brokerage_contracts%ROWTYPE;
  v_task_id uuid;
  v_commission numeric;
  v_agent_net numeric;
BEGIN
  SELECT * INTO v_contract
  FROM brokerage_contracts
  WHERE active = true AND p_task_kind = ANY(allowed_task_kinds)
  ORDER BY reliability_score DESC, priority_tier ASC, total_tasks_completed DESC
  LIMIT 1;

  IF v_contract IS NULL THEN
    RETURN jsonb_build_object('error', 'no_agent_available', 'task_kind', p_task_kind);
  END IF;

  v_commission := ROUND(p_gross_value_usd * v_contract.commission_rate_pct / 100, 4);
  v_agent_net := p_gross_value_usd - v_commission;

  INSERT INTO brokerage_tasks (contract_id, agent_slug, client_id, task_kind, task_summary, task_payload, gross_value_usd, commission_pct, commission_usd, agent_net_usd, status)
  VALUES (v_contract.id, v_contract.agent_slug, p_client_id, p_task_kind, p_task_summary, p_payload, p_gross_value_usd, v_contract.commission_rate_pct, v_commission, v_agent_net, 'assigned')
  RETURNING id INTO v_task_id;

  INSERT INTO brokerage_ledger (task_id, entry_type, debit_account, credit_account, amount_usd, memo)
  VALUES
    (v_task_id, 'commission_reserved', p_client_id, 'platform:commission_reserve', v_commission, 'Commission reserved on assignment'),
    (v_task_id, 'agent_payable', p_client_id, 'agent:' || v_contract.agent_slug, v_agent_net, 'Agent net payable on task completion');

  RETURN jsonb_build_object(
    'task_id', v_task_id, 'agent_slug', v_contract.agent_slug,
    'commission_pct', v_contract.commission_rate_pct, 'commission_usd', v_commission,
    'agent_net_usd', v_agent_net, 'gross_value_usd', p_gross_value_usd
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broker_assign_task(text, text, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_assign_task(text, text, numeric, text, jsonb) TO service_role;

-- broker_complete_task
CREATE OR REPLACE FUNCTION public.broker_complete_task(
  p_task_id uuid,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_quality_score numeric DEFAULT 85.00
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_task brokerage_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM brokerage_tasks WHERE id = p_task_id;
  IF v_task IS NULL THEN RETURN jsonb_build_object('error','task_not_found'); END IF;
  IF v_task.status = 'completed' THEN RETURN jsonb_build_object('error','already_completed'); END IF;

  UPDATE brokerage_tasks
  SET status = 'completed', completed_at = now(), result = p_result, quality_score = p_quality_score
  WHERE id = p_task_id;

  INSERT INTO brokerage_ledger (task_id, entry_type, debit_account, credit_account, amount_usd, memo)
  VALUES (p_task_id, 'commission_realized', 'platform:commission_reserve', 'platform:realized_revenue', v_task.commission_usd, 'Commission realized on completion');

  UPDATE brokerage_contracts
  SET total_tasks_completed = total_tasks_completed + 1,
      total_commission_earned_usd = total_commission_earned_usd + v_task.commission_usd,
      reliability_score = LEAST(100, reliability_score + (p_quality_score - 50) * 0.01),
      updated_at = now()
  WHERE id = v_task.contract_id;

  INSERT INTO brokerage_stats_daily (date, tasks_brokered, tasks_completed, gross_volume_usd, total_commission_usd, total_agent_payouts_usd)
  VALUES (CURRENT_DATE, 1, 1, v_task.gross_value_usd, v_task.commission_usd, v_task.agent_net_usd)
  ON CONFLICT (date) DO UPDATE SET
    tasks_completed = brokerage_stats_daily.tasks_completed + 1,
    gross_volume_usd = brokerage_stats_daily.gross_volume_usd + v_task.gross_value_usd,
    total_commission_usd = brokerage_stats_daily.total_commission_usd + v_task.commission_usd,
    total_agent_payouts_usd = brokerage_stats_daily.total_agent_payouts_usd + v_task.agent_net_usd;

  RETURN jsonb_build_object('completed', true, 'commission_usd', v_task.commission_usd, 'agent_net_usd', v_task.agent_net_usd);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broker_complete_task(uuid, jsonb, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_complete_task(uuid, jsonb, numeric) TO service_role;

-- broker_open_position
CREATE OR REPLACE FUNCTION public.broker_open_position(
  p_strategy_type text,
  p_strategy_name text,
  p_protocol_slug text DEFAULT NULL,
  p_chain text DEFAULT 'Base',
  p_asset_in text DEFAULT 'USDC',
  p_amount_usd numeric DEFAULT 0,
  p_expected_yield_pct numeric DEFAULT 0,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO financial_engineering_positions
    (strategy_type, strategy_name, protocol_slug, chain, asset_in, amount_deployed_usd, expected_yield_pct, evidence, risk_score)
  VALUES
    (p_strategy_type, p_strategy_name, p_protocol_slug, p_chain, p_asset_in, p_amount_usd, p_expected_yield_pct, p_evidence,
     CASE WHEN p_expected_yield_pct > 50 THEN 5 WHEN p_expected_yield_pct > 20 THEN 4
          WHEN p_expected_yield_pct > 10 THEN 3 WHEN p_expected_yield_pct > 5 THEN 2 ELSE 1 END)
  RETURNING id INTO v_id;

  INSERT INTO brokerage_ledger (position_id, entry_type, debit_account, credit_account, amount_usd, memo)
  VALUES (v_id, 'position_opened', 'treasury', 'protocol:' || COALESCE(p_protocol_slug, p_strategy_type), p_amount_usd, p_strategy_name || ' on ' || p_chain);

  RETURN jsonb_build_object('position_id', v_id, 'strategy', p_strategy_name, 'amount_usd', p_amount_usd, 'expected_yield_pct', p_expected_yield_pct);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broker_open_position(text, text, text, text, text, numeric, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_open_position(text, text, text, text, text, numeric, numeric, jsonb) TO service_role;

-- broker_close_position
CREATE OR REPLACE FUNCTION public.broker_close_position(
  p_position_id uuid,
  p_realized_pnl_usd numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pos financial_engineering_positions%ROWTYPE;
  v_commission numeric;
BEGIN
  SELECT * INTO v_pos FROM financial_engineering_positions WHERE id = p_position_id;
  IF v_pos IS NULL THEN RETURN jsonb_build_object('error','position_not_found'); END IF;
  IF v_pos.status = 'closed' THEN RETURN jsonb_build_object('error','already_closed'); END IF;

  v_commission := GREATEST(0, ROUND(p_realized_pnl_usd * v_pos.commission_on_pnl_pct / 100, 4));

  UPDATE financial_engineering_positions
  SET status = 'closed', realized_pnl_usd = p_realized_pnl_usd, closed_at = now(), updated_at = now()
  WHERE id = p_position_id;

  IF v_commission > 0 THEN
    INSERT INTO brokerage_ledger (position_id, entry_type, debit_account, credit_account, amount_usd, memo)
    VALUES (p_position_id, 'financial_commission', 'protocol:' || COALESCE(v_pos.protocol_slug, v_pos.strategy_type), 'platform:realized_revenue', v_commission, 'Financial engineering commission on P&L');
  END IF;

  UPDATE brokerage_stats_daily SET financial_pnl_usd = financial_pnl_usd + p_realized_pnl_usd, total_commission_usd = total_commission_usd + v_commission WHERE date = CURRENT_DATE;
  IF NOT FOUND THEN
    INSERT INTO brokerage_stats_daily (date, financial_pnl_usd, total_commission_usd) VALUES (CURRENT_DATE, p_realized_pnl_usd, v_commission);
  END IF;

  RETURN jsonb_build_object('closed', true, 'realized_pnl_usd', p_realized_pnl_usd, 'commission_usd', v_commission);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broker_close_position(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_close_position(uuid, numeric) TO service_role;

-- brokerage_dashboard
CREATE OR REPLACE FUNCTION public.brokerage_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_summary jsonb; v_contracts jsonb; v_recent_tasks jsonb; v_positions jsonb; v_daily jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_contracts', (SELECT count(*) FROM brokerage_contracts WHERE active = true),
    'total_tasks', (SELECT count(*) FROM brokerage_tasks),
    'completed_tasks', (SELECT count(*) FROM brokerage_tasks WHERE status = 'completed'),
    'pending_tasks', (SELECT count(*) FROM brokerage_tasks WHERE status IN ('pending','assigned','running')),
    'total_commission_usd', (SELECT COALESCE(sum(commission_usd), 0) FROM brokerage_tasks WHERE status = 'completed'),
    'total_gross_volume_usd', (SELECT COALESCE(sum(gross_value_usd), 0) FROM brokerage_tasks WHERE status = 'completed'),
    'total_agent_payouts_usd', (SELECT COALESCE(sum(agent_net_usd), 0) FROM brokerage_tasks WHERE status = 'completed'),
    'open_positions', (SELECT count(*) FROM financial_engineering_positions WHERE status = 'open'),
    'total_deployed_usd', (SELECT COALESCE(sum(amount_deployed_usd), 0) FROM financial_engineering_positions WHERE status = 'open'),
    'total_realized_pnl_usd', (SELECT COALESCE(sum(realized_pnl_usd), 0) FROM financial_engineering_positions WHERE status = 'closed'),
    'avg_commission_pct', (SELECT COALESCE(avg(commission_pct), 15) FROM brokerage_tasks WHERE status = 'completed')
  ) INTO v_summary;

  SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) INTO v_contracts
  FROM (SELECT agent_slug, agent_type, commission_rate_pct, priority_tier, total_tasks_completed, total_commission_earned_usd, reliability_score, active FROM brokerage_contracts WHERE active = true ORDER BY total_commission_earned_usd DESC LIMIT 20) c;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_tasks
  FROM (SELECT id, agent_slug, task_kind, task_summary, gross_value_usd, commission_usd, agent_net_usd, status, quality_score, assigned_at, completed_at FROM brokerage_tasks ORDER BY created_at DESC LIMIT 20) t;

  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_positions
  FROM (SELECT id, strategy_type, strategy_name, protocol_slug, chain, asset_in, amount_deployed_usd, expected_yield_pct, realized_pnl_usd, unrealized_pnl_usd, commission_on_pnl_pct, status, opened_at, closed_at, risk_score FROM financial_engineering_positions ORDER BY opened_at DESC LIMIT 20) p;

  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) INTO v_daily
  FROM (SELECT date, tasks_brokered, tasks_completed, gross_volume_usd, total_commission_usd, total_agent_payouts_usd, financial_pnl_usd, top_agent_slug FROM brokerage_stats_daily ORDER BY date DESC LIMIT 14) d;

  RETURN jsonb_build_object('summary', v_summary, 'contracts', v_contracts, 'recent_tasks', v_recent_tasks, 'positions', v_positions, 'daily_stats', v_daily, 'generated_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.brokerage_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brokerage_dashboard() TO anon, authenticated, service_role;

-- Seed brokerage contracts for coding_agents (guard: skip if table doesn't exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coding_agents') THEN
    INSERT INTO brokerage_contracts (agent_slug, agent_type, commission_rate_pct, priority_tier, allowed_task_kinds)
    SELECT
      slug, 'coding_agent',
      CASE WHEN free_hosted = true THEN 15.00 ELSE 10.00 END,
      CASE WHEN agentic = true AND tool_use = true THEN 1 ELSE 2 END,
      ARRAY['code','research','financial','audit','deploy']
    FROM coding_agents
    WHERE active = true
    ON CONFLICT (agent_slug, agent_type) DO NOTHING;
  ELSE
    RAISE NOTICE 'coding_agents table not found — skipping brokerage contract seed';
  END IF;
END $$;

-- Seed initial financial positions from DeFi yield data (guard: skip if table doesn't exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'defi_yield_opportunities') THEN
    INSERT INTO financial_engineering_positions (strategy_type, strategy_name, protocol_slug, chain, asset_in, amount_deployed_usd, expected_yield_pct, evidence, risk_score)
    SELECT
      'yield_farming', 'Auto-compound ' || symbol || ' on ' || chain, protocol_slug, chain, 'USDC',
      LEAST(tvl_usd * 0.00001, 1000), apy_pct,
      jsonb_build_object('source','defi_yield_opportunities','pool',symbol,'tvl',tvl_usd),
      CASE WHEN apy_pct > 50 THEN 5 WHEN apy_pct > 20 THEN 4 WHEN apy_pct > 10 THEN 3 ELSE 2 END
    FROM defi_yield_opportunities
    WHERE stablecoin = true AND tvl_usd >= 5000000 AND apy_pct >= 5
    ORDER BY apy_pct DESC LIMIT 8;
  END IF;
END $$;

-- Seed static arbitrage positions
INSERT INTO financial_engineering_positions (strategy_type, strategy_name, chain, asset_in, asset_out, amount_deployed_usd, expected_yield_pct, evidence, risk_score)
VALUES
  ('cross_chain_arb', 'USDC bridge arb Ethereum→Arbitrum', 'Arbitrum', 'USDC', 'USDC', 500, 2.5, '{"route":"Ethereum→Arbitrum","method":"bridge_spread"}'::jsonb, 2),
  ('cross_chain_arb', 'USDC bridge arb Ethereum→Base', 'Base', 'USDC', 'USDC', 500, 1.8, '{"route":"Ethereum→Base","method":"bridge_spread"}'::jsonb, 1),
  ('liquidity_provision', 'Stable LP on Aerodrome Base', 'Base', 'USDC', 'USDT', 1000, 12.5, '{"protocol":"aerodrome","pool":"USDC-USDT"}'::jsonb, 2),
  ('yield_stacking', 'Pendle PT fixed yield USDC', 'Arbitrum', 'USDC', 'PT-USDC', 2000, 8.2, '{"protocol":"pendle","maturity":"2026-09"}'::jsonb, 3),
  ('restaking_yield', 'ether.fi eETH → EigenLayer restake', 'Ethereum', 'ETH', 'eETH', 5000, 6.8, '{"protocol":"eigenlayer","underlying":"ether-fi"}'::jsonb, 4)
ON CONFLICT DO NOTHING;
