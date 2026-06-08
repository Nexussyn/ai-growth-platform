/*
  # Fix defi_opportunistic_overview chains aggregation

  payment_chains has no display_order column; use chain_id as ordering key
  via a subquery so jsonb_agg is fed pre-sorted rows.
*/

CREATE OR REPLACE FUNCTION public.defi_opportunistic_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_phase jsonb;
  v_metrics jsonb;
  v_protocols jsonb;
  v_categories jsonb;
  v_top_yields jsonb;
  v_top_stable_yields jsonb;
  v_signals jsonb;
  v_chains jsonb;
  v_funnel jsonb;
BEGIN
  SELECT jsonb_build_object(
    'phase', phase,
    'reason', reason,
    'set_by', set_by,
    'activated_at', activated_at,
    'updated_at', updated_at
  )
  INTO v_phase
  FROM system_phase_state
  WHERE pk = 'singleton';

  SELECT jsonb_build_object(
    'total_tvl_usd', total_tvl_usd,
    'stablecoin_mcap_usd', stablecoin_mcap_usd,
    'dex_volume_24h_usd', dex_volume_24h_usd,
    'protocols_tracked', protocols_tracked,
    'chains_tracked', chains_tracked,
    'observed_at', observed_at
  )
  INTO v_metrics
  FROM defi_metrics_snapshot
  ORDER BY observed_at DESC NULLS LAST
  LIMIT 1;

  SELECT jsonb_agg(row_to_json(p))
  INTO v_protocols
  FROM (
    SELECT slug, display_name, category, chains, permissionless, open_source, governance_token, short_description, homepage_url, display_order
    FROM defi_protocols
    WHERE active = true
    ORDER BY display_order
  ) p;

  SELECT jsonb_object_agg(category, n)
  INTO v_categories
  FROM (
    SELECT category, count(*) AS n
    FROM defi_protocols
    WHERE active = true
    GROUP BY category
  ) c;

  SELECT jsonb_agg(row_to_json(y))
  INTO v_top_yields
  FROM (
    SELECT protocol_slug, chain, symbol, apy_pct, apy_base_pct, apy_reward_pct, tvl_usd, stablecoin, il_risk, observed_at
    FROM defi_yield_opportunities
    WHERE tvl_usd >= 1000000
    ORDER BY apy_pct DESC NULLS LAST
    LIMIT 20
  ) y;

  SELECT jsonb_agg(row_to_json(y))
  INTO v_top_stable_yields
  FROM (
    SELECT protocol_slug, chain, symbol, apy_pct, tvl_usd, observed_at
    FROM defi_yield_opportunities
    WHERE stablecoin = true AND tvl_usd >= 1000000
    ORDER BY apy_pct DESC NULLS LAST
    LIMIT 12
  ) y;

  SELECT jsonb_agg(row_to_json(s))
  INTO v_signals
  FROM (
    SELECT id, source, signal_type, asset, chain, score, est_value_usd, expires_at, status, created_at
    FROM opportunistic_signals
    WHERE status IN ('open','active')
       OR created_at > now() - interval '24 hours'
    ORDER BY score DESC NULLS LAST, created_at DESC
    LIMIT 20
  ) s;

  SELECT jsonb_agg(row_to_json(c))
  INTO v_chains
  FROM (
    SELECT network, chain_id, token_symbol, last_scanned_block, last_scan_at, explorer_url, active
    FROM payment_chains
    WHERE active = true
    ORDER BY chain_id
  ) c;

  SELECT jsonb_object_agg(status, n)
  INTO v_funnel
  FROM (
    SELECT COALESCE(status,'unknown') AS status, count(*) AS n
    FROM revenue_opportunities
    GROUP BY status
  ) f;

  RETURN jsonb_build_object(
    'phase', COALESCE(v_phase, '{}'::jsonb),
    'metrics', COALESCE(v_metrics, '{}'::jsonb),
    'protocols', COALESCE(v_protocols, '[]'::jsonb),
    'protocols_by_category', COALESCE(v_categories, '{}'::jsonb),
    'top_yields', COALESCE(v_top_yields, '[]'::jsonb),
    'top_stable_yields', COALESCE(v_top_stable_yields, '[]'::jsonb),
    'opportunistic_signals', COALESCE(v_signals, '[]'::jsonb),
    'chains', COALESCE(v_chains, '[]'::jsonb),
    'opportunity_funnel', COALESCE(v_funnel, '{}'::jsonb),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.defi_opportunistic_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.defi_opportunistic_overview() TO anon, authenticated, service_role;