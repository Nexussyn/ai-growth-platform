import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, edgeFetch } from './supabase';
import type {
  LoopStatus,
  HealthStatus,
  AgentStatus,
  RevenueStream,
  ApiCall,
  MarketingSummary,
  ViralData,
  ReferralData,
  WalletConfig,
  WalletStatus,
  RevenueSummary,
  SystemMetrics,
  DashboardState,
  SchedulerStatus,
  SecurityStatus,
  RecruitmentStatus,
  QueueStatus,
  SecurityGatesStatus,
  ExpansionStatus,
  EngineStateData,
  ViralArtifact,
  ViralLoop,
  WalletProviderData,
  DeploymentStatus,
  ProfitSummary,
  GrowthBlockersData,
  MonetizationSummary,
  OrchestratorLiveData,
  AgentMessage,
  AgentTask,
  AgentEvent,
  AgentStat,
} from './types';

function usePolled<T>(
  fetcher: () => Promise<T>,
  intervalMs = 15000,
): { data: T | null; error: boolean; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasData = useRef(false);

  const run = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(false);
      hasData.current = true;
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
  }, [run, intervalMs]);

  return { data, error, loading, refresh: run };
}

export function usePolledEdge<T>(path: string, intervalMs = 15000) {
  return usePolled<T>(async () => {
    const res = await edgeFetch(path);
    if (!res.ok) throw new Error(`${path} failed`);
    return res.json();
  }, intervalMs);
}

// ── Full dashboard state (single composite fetch) ────────────────────────────
export function useDashboardState() {
  return usePolled<DashboardState>(async () => {
    const res = await edgeFetch('/dashboard/full');
    if (!res.ok) throw new Error('dashboard/full failed');
    return res.json();
  }, 15000);
}

// ── Edge function hooks ──────────────────────────────────────────────────────

export function useLoopStatus() {
  return usePolled<LoopStatus>(async () => {
    const res = await edgeFetch('/loop/status');
    if (!res.ok) throw new Error('loop/status failed');
    return res.json();
  });
}

export function useHealth() {
  return usePolled<HealthStatus>(async () => {
    const res = await edgeFetch('/health');
    if (!res.ok) throw new Error('health failed');
    return res.json();
  });
}

export function useSystemMetrics() {
  return usePolled<SystemMetrics>(async () => {
    const { data, error } = await supabase
      .from('system_metrics')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle();
    if (error) throw error;
    return data ?? {
      id: 'singleton',
      paid_calls: 0,
      total_gross_usdc: '0',
      total_payout_usdc: '0',
      total_reserve_usdc: '0',
      last_payment_at: null,
      updated_at: new Date().toISOString(),
    };
  }, 10000);
}

export function useRevenueSummary() {
  return usePolled<RevenueSummary>(async () => {
    const res = await edgeFetch('/revenue/summary');
    if (!res.ok) throw new Error('revenue/summary failed');
    return res.json();
  }, 10000);
}

// ── Supabase table hooks ─────────────────────────────────────────────────────

export function useAgentStatuses() {
  return usePolled<AgentStatus[]>(async () => {
    const { data, error } = await supabase
      .from('agent_status')
      .select('*')
      .order('agent_name');
    if (error) throw error;
    return data ?? [];
  });
}

export function useRevenueStreams() {
  return usePolled<RevenueStream[]>(async () => {
    const { data, error } = await supabase
      .from('revenue_stream')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  }, 10000);
}

export function useRecentApiCalls() {
  return usePolled<ApiCall[]>(async () => {
    const { data, error } = await supabase
      .from('api_calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  });
}

export function useMarketingSummary() {
  return usePolled<MarketingSummary>(async () => {
    const res = await edgeFetch('/marketing/summary');
    if (!res.ok) throw new Error('marketing/summary failed');
    return res.json();
  }, 30000);
}

export function useViralData() {
  return usePolled<ViralData>(async () => {
    const res = await edgeFetch('/viral');
    if (!res.ok) throw new Error('viral failed');
    return res.json();
  }, 30000);
}

export function useReferralData() {
  return usePolled<ReferralData>(async () => {
    const res = await edgeFetch('/referral');
    if (!res.ok) throw new Error('referral failed');
    return res.json();
  }, 60000);
}

export function useWalletConfig() {
  return usePolled<WalletConfig>(async () => {
    // Try direct table read first (faster)
    const { data, error } = await supabase
      .from('wallet_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return data;
    // Fallback to edge function endpoint
    const res = await edgeFetch('/admin/wallet-status');
    if (!res.ok) throw new Error('wallet-status failed');
    return res.json();
  }, 30000);
}

export function useWalletStatus() {
  return usePolled<WalletStatus>(async () => {
    const res = await edgeFetch('/admin/wallet-status');
    if (!res.ok) throw new Error('wallet-status failed');
    return res.json();
  }, 30000);
}

export function useSchedulerStatus() {
  return usePolled<SchedulerStatus>(async () => {
    const res = await edgeFetch('/scheduler/status');
    if (!res.ok) throw new Error('scheduler/status failed');
    return res.json();
  }, 10000);
}

export function useSecurityStatus() {
  return usePolled<SecurityStatus>(async () => {
    const res = await edgeFetch('/security/status');
    if (!res.ok) throw new Error('security/status failed');
    return res.json();
  }, 15000);
}

export function useRecruitmentStatus() {
  return usePolled<RecruitmentStatus>(async () => {
    const res = await edgeFetch('/recruitment/status');
    if (!res.ok) throw new Error('recruitment/status failed');
    return res.json();
  }, 20000);
}

export function useQueueStatus() {
  return usePolled<QueueStatus>(async () => {
    const res = await edgeFetch('/queue/status');
    if (!res.ok) throw new Error('queue/status failed');
    return res.json();
  }, 10000);
}

export function useSecurityGates() {
  return usePolled<SecurityGatesStatus>(async () => {
    const res = await edgeFetch('/gates/status');
    if (!res.ok) throw new Error('gates/status failed');
    return res.json();
  }, 15000);
}

export function useExpansionStatus() {
  return usePolled<ExpansionStatus>(async () => {
    const res = await edgeFetch('/expansion/status');
    if (!res.ok) throw new Error('expansion/status failed');
    return res.json();
  }, 15000);
}

export function useEngineState() {
  return usePolled<EngineStateData>(async () => {
    const res = await edgeFetch('/engine/state');
    if (!res.ok) throw new Error('engine/state failed');
    return res.json();
  }, 10000);
}

export function useViralArtifacts() {
  return usePolled<{ artifacts: ViralArtifact[] }>(async () => {
    const res = await edgeFetch('/viral/artifacts');
    if (!res.ok) throw new Error('viral/artifacts failed');
    return res.json();
  }, 30000);
}

export function useViralLoops() {
  return usePolled<{ loops: ViralLoop[] }>(async () => {
    const res = await edgeFetch('/viral/loops');
    if (!res.ok) throw new Error('viral/loops failed');
    return res.json();
  }, 30000);
}

export function useWalletProviders() {
  return usePolled<{ providers: WalletProviderData[]; configured_wallet: boolean; destination_masked: string; chain: string; asset: string; price_per_call: number }>(async () => {
    const res = await edgeFetch('/wallet/providers');
    if (!res.ok) throw new Error('wallet/providers failed');
    return res.json();
  }, 60000);
}

export function useDeploymentStatus() {
  return usePolled<DeploymentStatus>(async () => {
    const res = await edgeFetch('/deployment/status');
    if (!res.ok) throw new Error('deployment/status failed');
    return res.json();
  }, 15000);
}

export function useProfitSummary() {
  return usePolled<ProfitSummary>(async () => {
    const res = await edgeFetch('/profit/summary');
    if (!res.ok) throw new Error('profit/summary failed');
    return res.json();
  }, 10000);
}

export function useGrowthBlockers() {
  return usePolled<GrowthBlockersData>(async () => {
    const res = await edgeFetch('/growth/blockers');
    if (!res.ok) throw new Error('growth/blockers failed');
    return res.json();
  }, 15000);
}

export function useMonetizationSummary() {
  return usePolled<MonetizationSummary>(async () => {
    const res = await edgeFetch('/monetization/summary');
    if (!res.ok) throw new Error('monetization/summary failed');
    return res.json();
  }, 15000);
}

export function useOrchestratorLive() {
  return usePolled<OrchestratorLiveData>(async () => {
    const res = await edgeFetch('/orchestrator/live');
    if (!res.ok) throw new Error('orchestrator/live failed');
    return res.json();
  }, 8000);
}

export function useAgentMessages() {
  return usePolled<{ messages: AgentMessage[] }>(async () => {
    const res = await edgeFetch('/agents/messages');
    if (!res.ok) throw new Error('agents/messages failed');
    return res.json();
  }, 10000);
}

export function useAgentTasks() {
  return usePolled<{ tasks: AgentTask[] }>(async () => {
    const res = await edgeFetch('/agents/tasks');
    if (!res.ok) throw new Error('agents/tasks failed');
    return res.json();
  }, 10000);
}

export function useAgentEvents() {
  return usePolled<{ events: AgentEvent[] }>(async () => {
    const res = await edgeFetch('/agents/events');
    if (!res.ok) throw new Error('agents/events failed');
    return res.json();
  }, 8000);
}

export function useAgentStats() {
  return usePolled<{ agent_stats: Record<string, AgentStat> }>(async () => {
    const res = await edgeFetch('/agents/stats');
    if (!res.ok) throw new Error('agents/stats failed');
    return res.json();
  }, 15000);
}
