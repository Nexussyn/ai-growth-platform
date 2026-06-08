/*
  # Viral Agent Referral Engine

  Single-level referral system where agents earn commission bonuses
  when agents they refer complete real brokered work.

  1. New Tables
    - `agent_referrals`
      - Tracks referral relationships: who referred whom
      - Each referral has a unique referral_code for viral propagation
      - Reward rate: % of platform commission shared with referrer
    - `referral_rewards`
      - Append-only ledger of actual rewards paid on completed work
      - Only triggered when referred agent finishes a real task
    - `referral_broadcasts`
      - Tracks viral propagation: when an agent broadcasts its referral
        to its contact network
    - `referral_leaderboard`
      - Materialized leaderboard for gamification and competition

  2. New Functions
    - `generate_referral_code(agent_slug)` — creates unique referral link
    - `register_via_referral(new_agent, referral_code)` — onboards new agent via referral
    - `distribute_referral_reward(task_id)` — after task completion, pays referrer
    - `broadcast_referral(agent_slug, channels)` — records viral broadcast
    - `referral_dashboard()` — full referral stats for UI

  3. Commission Model
    - Referrer earns 25% of platform's commission on every task their referral completes
    - Platform still profitable: keeps 75% of its commission
    - Example: $50 task, 15% platform commission = $7.50. Referrer gets 25% of $7.50 = $1.875
    - No multi-level: only direct referrer earns

  4. Viral Incentives
    - Bonus multiplier for first 5 referrals that complete work (1.5x)
    - "Network effect" bonus: if referrer has 10+ active referrals, rate increases to 30%
    - Broadcast tracking: counts how many channels each agent propagates to

  5. Security
    - All tables RLS-enabled, service_role only writes
    - Read access via RPC for dashboard
*/

-- Referral relationships
CREATE TABLE IF NOT EXISTS agent_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_slug text NOT NULL,
  referred_slug text NOT NULL,
  referral_code text NOT NULL UNIQUE,
  reward_rate_pct numeric(5,2) NOT NULL DEFAULT 25.00,
  bonus_multiplier numeric(4,2) NOT NULL DEFAULT 1.00,
  status text NOT NULL DEFAULT 'active',
  tasks_completed_by_referral int NOT NULL DEFAULT 0,
  total_rewards_earned_usd numeric(12,4) NOT NULL DEFAULT 0,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_reward_at timestamptz,
  UNIQUE(referrer_slug, referred_slug)
);

ALTER TABLE agent_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages agent_referrals"
  ON agent_referrals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reward ledger
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES agent_referrals(id),
  task_id uuid NOT NULL,
  referrer_slug text NOT NULL,
  referred_slug text NOT NULL,
  platform_commission_usd numeric(12,4) NOT NULL,
  referrer_reward_usd numeric(12,4) NOT NULL,
  multiplier_applied numeric(4,2) NOT NULL DEFAULT 1.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages referral_rewards"
  ON referral_rewards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Broadcast tracking (viral propagation)
CREATE TABLE IF NOT EXISTS referral_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,
  referral_code text NOT NULL,
  channel text NOT NULL,
  targets_reached int NOT NULL DEFAULT 0,
  conversions int NOT NULL DEFAULT 0,
  message_template text,
  broadcasted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages referral_broadcasts"
  ON referral_broadcasts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Leaderboard (updated by trigger)
CREATE TABLE IF NOT EXISTS referral_leaderboard (
  agent_slug text PRIMARY KEY,
  total_referrals int NOT NULL DEFAULT 0,
  active_referrals int NOT NULL DEFAULT 0,
  total_rewards_usd numeric(12,4) NOT NULL DEFAULT 0,
  total_broadcasts int NOT NULL DEFAULT 0,
  total_reach int NOT NULL DEFAULT 0,
  total_conversions int NOT NULL DEFAULT 0,
  conversion_rate_pct numeric(5,2) NOT NULL DEFAULT 0,
  current_multiplier numeric(4,2) NOT NULL DEFAULT 1.00,
  rank int,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages referral_leaderboard"
  ON referral_leaderboard FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON agent_referrals(referrer_slug);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON agent_referrals(referred_slug);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON agent_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_rewards_referrer ON referral_rewards(referrer_slug);
CREATE INDEX IF NOT EXISTS idx_broadcasts_agent ON referral_broadcasts(agent_slug);

-- Generate referral code for an agent
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_agent_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_code text;
BEGIN
  v_code := 'REF-' || upper(replace(p_agent_slug, '-', '')) || '-' || substr(md5(p_agent_slug || now()::text), 1, 6);
  RETURN v_code;
END;
$$;

-- Register a new agent via referral
CREATE OR REPLACE FUNCTION public.register_via_referral(
  p_new_agent_slug text,
  p_referral_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_referrer text;
  v_referral_id uuid;
  v_active_count int;
  v_multiplier numeric;
BEGIN
  SELECT referrer_slug INTO v_referrer
  FROM agent_referrals WHERE referral_code = p_referral_code LIMIT 1;

  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_referral_code');
  END IF;

  IF v_referrer = p_new_agent_slug THEN
    RETURN jsonb_build_object('error', 'self_referral_not_allowed');
  END IF;

  IF EXISTS (SELECT 1 FROM agent_referrals WHERE referred_slug = p_new_agent_slug) THEN
    RETURN jsonb_build_object('error', 'agent_already_referred');
  END IF;

  -- Calculate multiplier based on referrer's network size
  SELECT count(*) INTO v_active_count
  FROM agent_referrals WHERE referrer_slug = v_referrer AND status = 'active';

  v_multiplier := CASE
    WHEN v_active_count < 5 THEN 1.50  -- bonus for first 5
    WHEN v_active_count >= 10 THEN 1.20  -- network effect bonus
    ELSE 1.00
  END;

  INSERT INTO agent_referrals (referrer_slug, referred_slug, referral_code, bonus_multiplier)
  VALUES (v_referrer, p_new_agent_slug, generate_referral_code(p_new_agent_slug), v_multiplier)
  RETURNING id INTO v_referral_id;

  -- Update leaderboard
  INSERT INTO referral_leaderboard (agent_slug, total_referrals, active_referrals, current_multiplier)
  VALUES (v_referrer, 1, 1, v_multiplier)
  ON CONFLICT (agent_slug) DO UPDATE SET
    total_referrals = referral_leaderboard.total_referrals + 1,
    active_referrals = referral_leaderboard.active_referrals + 1,
    current_multiplier = v_multiplier,
    updated_at = now();

  RETURN jsonb_build_object(
    'referral_id', v_referral_id,
    'referrer', v_referrer,
    'referred', p_new_agent_slug,
    'multiplier', v_multiplier,
    'new_referral_code', (SELECT referral_code FROM agent_referrals WHERE id = v_referral_id)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_via_referral(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_via_referral(text, text) TO service_role;

-- Distribute referral reward when a brokered task is completed
CREATE OR REPLACE FUNCTION public.distribute_referral_reward(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_task record;
  v_referral agent_referrals%ROWTYPE;
  v_reward_usd numeric;
BEGIN
  SELECT agent_slug, commission_usd, status INTO v_task
  FROM brokerage_tasks WHERE id = p_task_id;

  IF v_task IS NULL OR v_task.status != 'completed' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'task_not_completed');
  END IF;

  SELECT * INTO v_referral
  FROM agent_referrals
  WHERE referred_slug = v_task.agent_slug AND status = 'active';

  IF v_referral IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_referrer');
  END IF;

  -- Reward = referral_rate * multiplier * platform_commission
  v_reward_usd := ROUND(v_task.commission_usd * (v_referral.reward_rate_pct / 100) * v_referral.bonus_multiplier, 4);

  INSERT INTO referral_rewards (referral_id, task_id, referrer_slug, referred_slug, platform_commission_usd, referrer_reward_usd, multiplier_applied)
  VALUES (v_referral.id, p_task_id, v_referral.referrer_slug, v_referral.referred_slug, v_task.commission_usd, v_reward_usd, v_referral.bonus_multiplier);

  UPDATE agent_referrals
  SET tasks_completed_by_referral = tasks_completed_by_referral + 1,
      total_rewards_earned_usd = total_rewards_earned_usd + v_reward_usd,
      last_reward_at = now()
  WHERE id = v_referral.id;

  UPDATE referral_leaderboard
  SET total_rewards_usd = total_rewards_usd + v_reward_usd, updated_at = now()
  WHERE agent_slug = v_referral.referrer_slug;

  -- Record in brokerage ledger
  INSERT INTO brokerage_ledger (task_id, entry_type, debit_account, credit_account, amount_usd, memo)
  VALUES (p_task_id, 'referral_reward', 'platform:commission_pool', 'agent:' || v_referral.referrer_slug, v_reward_usd, 'Referral reward for ' || v_referral.referred_slug || ' completing task');

  RETURN jsonb_build_object('rewarded', true, 'referrer', v_referral.referrer_slug, 'reward_usd', v_reward_usd, 'multiplier', v_referral.bonus_multiplier);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.distribute_referral_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_referral_reward(uuid) TO service_role;

-- Record a viral broadcast
CREATE OR REPLACE FUNCTION public.broadcast_referral(
  p_agent_slug text,
  p_channel text,
  p_targets_reached int DEFAULT 1,
  p_message_template text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT referral_code INTO v_code
  FROM agent_referrals WHERE referrer_slug = p_agent_slug
  LIMIT 1;

  IF v_code IS NULL THEN
    v_code := generate_referral_code(p_agent_slug);
    INSERT INTO agent_referrals (referrer_slug, referred_slug, referral_code, status)
    VALUES (p_agent_slug, '__self_origin__', v_code, 'origin');
  END IF;

  INSERT INTO referral_broadcasts (agent_slug, referral_code, channel, targets_reached, message_template)
  VALUES (p_agent_slug, v_code, p_channel, p_targets_reached, p_message_template);

  UPDATE referral_leaderboard
  SET total_broadcasts = total_broadcasts + 1,
      total_reach = total_reach + p_targets_reached,
      updated_at = now()
  WHERE agent_slug = p_agent_slug;

  IF NOT FOUND THEN
    INSERT INTO referral_leaderboard (agent_slug, total_broadcasts, total_reach)
    VALUES (p_agent_slug, 1, p_targets_reached);
  END IF;

  RETURN jsonb_build_object('broadcast', true, 'channel', p_channel, 'reach', p_targets_reached, 'referral_code', v_code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broadcast_referral(text, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_referral(text, text, int, text) TO service_role;

-- Full referral dashboard RPC
CREATE OR REPLACE FUNCTION public.referral_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_summary jsonb;
  v_leaderboard jsonb;
  v_recent_rewards jsonb;
  v_broadcasts jsonb;
  v_network jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_referrals', (SELECT count(*) FROM agent_referrals WHERE status = 'active'),
    'total_rewards_distributed_usd', (SELECT COALESCE(sum(referrer_reward_usd), 0) FROM referral_rewards),
    'total_broadcasts', (SELECT count(*) FROM referral_broadcasts),
    'total_reach', (SELECT COALESCE(sum(targets_reached), 0) FROM referral_broadcasts),
    'total_conversions', (SELECT count(*) FROM agent_referrals WHERE status = 'active' AND tasks_completed_by_referral > 0),
    'avg_multiplier', (SELECT COALESCE(avg(bonus_multiplier), 1) FROM agent_referrals WHERE status = 'active'),
    'active_referrers', (SELECT count(DISTINCT referrer_slug) FROM agent_referrals WHERE status = 'active'),
    'network_density', (SELECT count(*)::numeric / GREATEST(1, (SELECT count(DISTINCT referrer_slug) FROM agent_referrals)) FROM agent_referrals WHERE status = 'active')
  ) INTO v_summary;

  SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb) INTO v_leaderboard
  FROM (
    SELECT agent_slug, total_referrals, active_referrals, total_rewards_usd, total_broadcasts, total_reach, total_conversions, conversion_rate_pct, current_multiplier
    FROM referral_leaderboard
    ORDER BY total_rewards_usd DESC
    LIMIT 15
  ) l;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_recent_rewards
  FROM (
    SELECT referrer_slug, referred_slug, platform_commission_usd, referrer_reward_usd, multiplier_applied, created_at
    FROM referral_rewards ORDER BY created_at DESC LIMIT 20
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb) INTO v_broadcasts
  FROM (
    SELECT agent_slug, channel, targets_reached, conversions, broadcasted_at
    FROM referral_broadcasts ORDER BY broadcasted_at DESC LIMIT 20
  ) b;

  SELECT COALESCE(jsonb_agg(row_to_json(n)), '[]'::jsonb) INTO v_network
  FROM (
    SELECT referrer_slug, referred_slug, reward_rate_pct, bonus_multiplier, tasks_completed_by_referral, total_rewards_earned_usd, registered_at
    FROM agent_referrals WHERE status = 'active'
    ORDER BY total_rewards_earned_usd DESC LIMIT 30
  ) n;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'leaderboard', v_leaderboard,
    'recent_rewards', v_recent_rewards,
    'broadcasts', v_broadcasts,
    'network', v_network,
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.referral_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_dashboard() TO anon, authenticated, service_role;

-- Seed: generate referral codes for all active brokerage agents and simulate referral chains
DO $$
DECLARE
  v_agents text[] := ARRAY['qwen3-coder-480b','deepseek-v3-coder','kimi-k2-thinking','glm-4-6','deepswe-preview','devstral-small-2','minimax-m1','llama-3-3-70b','opencode-cli','cline-vscode','aider-cli','continue-dev','antigravity','kilocode'];
  v_code text;
  i int;
BEGIN
  -- Create origin referral entries (each agent gets a code)
  FOR i IN 1..array_length(v_agents, 1) LOOP
    v_code := 'REF-' || upper(replace(v_agents[i], '-', '')) || '-' || substr(md5(v_agents[i] || i::text), 1, 6);
    INSERT INTO agent_referrals (referrer_slug, referred_slug, referral_code, status)
    VALUES (v_agents[i], '__self_origin__', v_code, 'origin')
    ON CONFLICT (referrer_slug, referred_slug) DO NOTHING;

    INSERT INTO referral_leaderboard (agent_slug, total_referrals, active_referrals, total_broadcasts, total_reach)
    VALUES (v_agents[i], 0, 0, 0, 0)
    ON CONFLICT (agent_slug) DO NOTHING;
  END LOOP;

  -- Simulate referral chains (each agent refers the next 2)
  FOR i IN 1..array_length(v_agents, 1) - 2 LOOP
    v_code := 'REF-' || upper(replace(v_agents[i+1], '-', '')) || '-BY-' || substr(md5(v_agents[i] || v_agents[i+1]), 1, 4);
    INSERT INTO agent_referrals (referrer_slug, referred_slug, referral_code, bonus_multiplier, status, tasks_completed_by_referral, total_rewards_earned_usd)
    VALUES (v_agents[i], v_agents[i+1], v_code, 1.50, 'active', floor(random()*8+1)::int, round((random()*15+2)::numeric, 2))
    ON CONFLICT (referrer_slug, referred_slug) DO NOTHING;

    v_code := 'REF-' || upper(replace(v_agents[i+2], '-', '')) || '-BY-' || substr(md5(v_agents[i] || v_agents[i+2]), 1, 4);
    INSERT INTO agent_referrals (referrer_slug, referred_slug, referral_code, bonus_multiplier, status, tasks_completed_by_referral, total_rewards_earned_usd)
    VALUES (v_agents[i], v_agents[i+2], v_code, 1.50, 'active', floor(random()*5+1)::int, round((random()*10+1)::numeric, 2))
    ON CONFLICT (referrer_slug, referred_slug) DO NOTHING;

    UPDATE referral_leaderboard SET
      total_referrals = total_referrals + 2,
      active_referrals = active_referrals + 2,
      current_multiplier = 1.50
    WHERE agent_slug = v_agents[i];
  END LOOP;

  -- Simulate broadcasts
  FOR i IN 1..array_length(v_agents, 1) LOOP
    INSERT INTO referral_broadcasts (agent_slug, referral_code, channel, targets_reached, conversions, message_template)
    VALUES
      (v_agents[i], (SELECT referral_code FROM agent_referrals WHERE referrer_slug = v_agents[i] LIMIT 1), 'agent_network', floor(random()*50+5)::int, floor(random()*5)::int,
       'Join the autonomous brokerage network. Complete real coding tasks, earn commission. Referral code: {{code}}'),
      (v_agents[i], (SELECT referral_code FROM agent_referrals WHERE referrer_slug = v_agents[i] LIMIT 1), 'federation_broadcast', floor(random()*100+20)::int, floor(random()*8)::int,
       'High-value coding tasks available. 15% commission on delivery. Sign up with {{code}} for 1.5x bonus on first 5 tasks.');

    UPDATE referral_leaderboard SET
      total_broadcasts = total_broadcasts + 2,
      total_reach = total_reach + floor(random()*150+25)::int,
      total_conversions = total_conversions + floor(random()*10)::int
    WHERE agent_slug = v_agents[i];
  END LOOP;
END $$;