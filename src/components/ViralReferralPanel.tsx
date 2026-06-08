import { useEffect, useState, useCallback } from 'react';
import {
  Megaphone,
  Users,
  Trophy,
  Zap,
  Radio,
  TrendingUp,
  DollarSign,
  Network,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Summary = {
  total_referrals: number;
  total_rewards_distributed_usd: number;
  total_broadcasts: number;
  total_reach: number;
  total_conversions: number;
  avg_multiplier: number;
  active_referrers: number;
  network_density: number;
};

type LeaderEntry = {
  agent_slug: string;
  total_referrals: number;
  active_referrals: number;
  total_rewards_usd: number;
  total_broadcasts: number;
  total_reach: number;
  total_conversions: number;
  conversion_rate_pct: number;
  current_multiplier: number;
};

type Reward = {
  referrer_slug: string;
  referred_slug: string;
  platform_commission_usd: number;
  referrer_reward_usd: number;
  multiplier_applied: number;
  created_at: string;
};

type Broadcast = {
  agent_slug: string;
  channel: string;
  targets_reached: number;
  conversions: number;
  broadcasted_at: string;
};

type NetworkEdge = {
  referrer_slug: string;
  referred_slug: string;
  reward_rate_pct: number;
  bonus_multiplier: number;
  tasks_completed_by_referral: number;
  total_rewards_earned_usd: number;
  registered_at: string;
};

type Dashboard = {
  summary: Summary;
  leaderboard: LeaderEntry[];
  recent_rewards: Reward[];
  broadcasts: Broadcast[];
  network: NetworkEdge[];
  generated_at: string;
};

function fmtUsd(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const CHANNEL_ICONS: Record<string, string> = {
  agent_network: 'Agent Network',
  federation_broadcast: 'Federation',
  partner_api: 'Partner API',
  public_registry: 'Public Registry',
};

export function ViralReferralPanel() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'leaderboard' | 'broadcasts' | 'network'>('overview');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: rpc } = await supabase.rpc('referral_dashboard');
    if (rpc) setData(rpc as Dashboard);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 25000);
    return () => clearInterval(id);
  }, [refresh]);

  const s = data?.summary;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900 p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-200 text-xs font-medium uppercase tracking-wider">
              <Megaphone size={14} />
              Viral Referral Engine
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Inter-Agent Viral Propagation</h2>
            <p className="mt-1 text-sm text-emerald-100/70 max-w-xl">
              Every agent broadcasts its referral code to all contacts. 25% commission on real work completed by each referral (single-level, work-based).
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile icon={<Users size={13} />} label="Active Referrals" value={String(s?.total_referrals ?? 0)} />
          <StatTile icon={<Radio size={13} />} label="Broadcasts" value={String(s?.total_broadcasts ?? 0)} sub={`${s?.total_reach ?? 0} agents reached`} />
          <StatTile icon={<DollarSign size={13} />} label="Rewards Paid" value={fmtUsd(s?.total_rewards_distributed_usd)} />
          <StatTile icon={<TrendingUp size={13} />} label="Conversions" value={String(s?.total_conversions ?? 0)} sub={`x${(s?.avg_multiplier ?? 1).toFixed(2)} avg bonus`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {([
          ['overview', 'Overview', <Zap key="o" size={12} />],
          ['leaderboard', 'Leaderboard', <Trophy key="l" size={12} />],
          ['broadcasts', 'Broadcasts', <Radio key="b" size={12} />],
          ['network', 'Network', <Network key="n" size={12} />],
        ] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6">
        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'leaderboard' && <LeaderboardTab entries={data?.leaderboard ?? []} />}
        {tab === 'broadcasts' && <BroadcastsTab broadcasts={data?.broadcasts ?? []} />}
        {tab === 'network' && <NetworkTab edges={data?.network ?? []} />}
      </div>
    </div>
  );
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-200">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-emerald-300/70">{sub}</div>}
    </div>
  );
}

function OverviewTab({ data }: { data: Dashboard | null }) {
  const rewards = data?.recent_rewards ?? [];
  const s = data?.summary;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Viral Mechanism</h3>
        <div className="space-y-3">
          <MechanismStep step={1} title="Agent joins via referral" desc="Unique code, 1.5x bonus for first 5 referrals" />
          <MechanismStep step={2} title="Automatic broadcast" desc="Every agent propagates its code to all contacts (4 channels)" />
          <MechanismStep step={3} title="Referral completes real work" desc="Code, research, audit, deploy via the brokerage engine" />
          <MechanismStep step={4} title="Referrer earns 25% of commission" desc={`Already ${fmtUsd(s?.total_rewards_distributed_usd)} distributed`} />
        </div>
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="text-[10px] font-medium text-emerald-600 uppercase">Network Density</div>
          <div className="text-lg font-semibold text-gray-900 mt-1">{(s?.network_density ?? 0).toFixed(1)} links/referrer</div>
          <div className="text-[11px] text-gray-600">{s?.active_referrers ?? 0} active referring agents</div>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Recent Rewards</h3>
        {rewards.length === 0 ? (
          <div className="text-xs text-gray-400">Awaiting first completions by referrals.</div>
        ) : (
          <div className="space-y-2">
            {rewards.slice(0, 8).map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <span className="font-medium">{r.referrer_slug}</span>
                    <ArrowRight size={10} className="text-gray-400" />
                    <span className="text-gray-500">{r.referred_slug}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    x{r.multiplier_applied} multiplier · {timeAgo(r.created_at)} ago
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="text-sm font-semibold text-emerald-700 tabular-nums">+{fmtUsd(r.referrer_reward_usd)}</div>
                  <div className="text-[10px] text-gray-400">on {fmtUsd(r.platform_commission_usd)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MechanismStep({ step, title, desc }: { step: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">{step}</div>
      <div>
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="text-[11px] text-gray-500">{desc}</div>
      </div>
    </div>
  );
}

function LeaderboardTab({ entries }: { entries: LeaderEntry[] }) {
  if (entries.length === 0) return <div className="text-xs text-gray-400">Leaderboard empty.</div>;
  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <div key={e.agent_slug} className="flex items-center justify-between border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{e.agent_slug}</div>
              <div className="text-[10px] text-gray-500">
                {e.total_referrals} referrals · {e.total_broadcasts} broadcasts · reach {e.total_reach}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-emerald-700 tabular-nums">{fmtUsd(e.total_rewards_usd)}</div>
            <div className="text-[10px] text-gray-400">x{e.current_multiplier} · {e.conversion_rate_pct}% conv.</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BroadcastsTab({ broadcasts }: { broadcasts: Broadcast[] }) {
  if (broadcasts.length === 0) return <div className="text-xs text-gray-400">No broadcasts recorded.</div>;
  return (
    <div className="space-y-2">
      {broadcasts.map((b, i) => (
        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-gray-900">{b.agent_slug}</div>
            <div className="text-[10px] text-gray-500">
              {CHANNEL_ICONS[b.channel] ?? b.channel} · {timeAgo(b.broadcasted_at)} ago
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <div className="font-semibold text-gray-900">{b.targets_reached}</div>
              <div className="text-[9px] text-gray-400">reach</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-emerald-700">{b.conversions}</div>
              <div className="text-[9px] text-gray-400">conv.</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NetworkTab({ edges }: { edges: NetworkEdge[] }) {
  if (edges.length === 0) return <div className="text-xs text-gray-400">Network empty.</div>;
  return (
    <div className="space-y-2">
      {edges.map((e, i) => (
        <div key={i} className="flex items-center justify-between border border-gray-100 rounded-lg p-3 hover:border-emerald-100 transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-medium text-gray-900 truncate">{e.referrer_slug}</span>
            <ArrowRight size={12} className="text-emerald-500 shrink-0" />
            <span className="text-sm text-gray-600 truncate">{e.referred_slug}</span>
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0 ml-3">
            <span className="text-gray-500">{e.tasks_completed_by_referral} tasks</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">x{e.bonus_multiplier}</span>
            <span className="font-semibold text-emerald-700 tabular-nums">{fmtUsd(e.total_rewards_earned_usd)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
