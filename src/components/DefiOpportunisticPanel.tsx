import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  TrendingUp,
  Globe2,
  Layers,
  Shield,
  Zap,
  RefreshCw,
  ExternalLink,
  CircleDot,
  Coins,
  Network,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Phase = {
  phase: string;
  reason: string;
  set_by: string;
  activated_at: string;
  updated_at: string;
};

type Metrics = {
  total_tvl_usd: string | number;
  stablecoin_mcap_usd: string | number;
  dex_volume_24h_usd: string | number;
  protocols_tracked: number;
  chains_tracked: number;
  observed_at: string;
};

type Protocol = {
  slug: string;
  display_name: string;
  category: string;
  chains: string[];
  permissionless: boolean;
  open_source: boolean;
  governance_token: string | null;
  short_description: string;
  homepage_url: string;
};

type Yield = {
  protocol_slug: string;
  chain: string;
  symbol: string;
  apy_pct: string | number;
  apy_base_pct?: string | number;
  apy_reward_pct?: string | number;
  tvl_usd: string | number;
  stablecoin?: boolean;
  il_risk?: string;
};

type Signal = {
  id: string;
  source: string;
  signal_type: string;
  asset: string;
  chain: string;
  score: number;
  est_value_usd: string | number;
  expires_at: string;
  status: string;
  created_at: string;
};

type Chain = {
  network: string;
  chain_id: number;
  token_symbol: string;
  last_scanned_block: number;
  last_scan_at: string | null;
  explorer_url: string;
  active: boolean;
};

type Overview = {
  phase: Phase;
  metrics: Metrics;
  protocols: Protocol[];
  protocols_by_category: Record<string, number>;
  top_yields: Yield[];
  top_stable_yields: Yield[];
  opportunistic_signals: Signal[];
  chains: Chain[];
  opportunity_funnel: Record<string, number>;
  generated_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  dex: 'bg-sky-50 text-sky-700 border-sky-200',
  lending: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  liquid_staking: 'bg-teal-50 text-teal-700 border-teal-200',
  restaking: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  yield: 'bg-amber-50 text-amber-700 border-amber-200',
  perps: 'bg-rose-50 text-rose-700 border-rose-200',
  cdp: 'bg-orange-50 text-orange-700 border-orange-200',
  stablecoin: 'bg-slate-50 text-slate-700 border-slate-200',
};

function fmtUsd(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DefiOpportunisticPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'yields' | 'signals' | 'protocols' | 'chains'>('overview');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rpc, error: rpcErr } = await supabase.rpc('defi_opportunistic_overview');
    if (rpcErr) {
      setError(rpcErr.message);
      setLoading(false);
      return;
    }
    setData(rpc as Overview);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const phaseActive = data?.phase?.phase === 'opportunistic';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-gradient-to-br from-slate-900 via-emerald-900 to-teal-900 p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-200 text-xs font-medium uppercase tracking-wider">
              <Globe2 size={14} />
              Worldwide Decentralized Finance
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Opportunistic Phase Active</h2>
            <p className="mt-2 text-sm text-slate-200 max-w-2xl leading-relaxed">
              {data?.phase?.reason ||
                'Continuous yield, arbitrage, and revenue-signal capture across all permissionless venues.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
                  phaseActive
                    ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40'
                    : 'bg-slate-500/20 text-slate-200 ring-1 ring-slate-400/30'
                }`}
              >
                <CircleDot size={10} className="animate-pulse" />
                Phase: {data?.phase?.phase ?? '—'}
              </span>
              {data?.phase?.activated_at && (
                <span className="text-slate-300">since {timeAgo(data.phase.activated_at)}</span>
              )}
              <span className="text-slate-300">last refresh {timeAgo(data?.generated_at)}</span>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            icon={<Layers size={14} />}
            label="Total TVL"
            value={fmtUsd(data?.metrics?.total_tvl_usd)}
            sub={`${data?.metrics?.protocols_tracked ?? '—'} protocols`}
          />
          <Stat
            icon={<Coins size={14} />}
            label="Stablecoin Mcap"
            value={fmtUsd(data?.metrics?.stablecoin_mcap_usd)}
            sub="global supply"
          />
          <Stat
            icon={<Activity size={14} />}
            label="DEX Volume 24h"
            value={fmtUsd(data?.metrics?.dex_volume_24h_usd)}
            sub={`${data?.metrics?.chains_tracked ?? '—'} chains`}
          />
          <Stat
            icon={<TrendingUp size={14} />}
            label="Live Signals"
            value={String(data?.opportunistic_signals?.length ?? 0)}
            sub="open / 24h"
          />
        </div>
      </div>

      <div className="border-b border-gray-200 px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {([
          ['overview', 'Overview', <Zap key="o" size={12} />],
          ['yields', `Yields (${data?.top_yields?.length ?? 0})`, <TrendingUp key="y" size={12} />],
          ['signals', `Signals (${data?.opportunistic_signals?.length ?? 0})`, <Activity key="s" size={12} />],
          ['protocols', `Protocols (${data?.protocols?.length ?? 0})`, <Shield key="p" size={12} />],
          ['chains', `Chains (${data?.chains?.length ?? 0})`, <Network key="c" size={12} />],
        ] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {error}
          </div>
        )}

        {tab === 'overview' && data && <OverviewTab data={data} />}
        {tab === 'yields' && <YieldsTab yields={data?.top_yields ?? []} stable={data?.top_stable_yields ?? []} />}
        {tab === 'signals' && <SignalsTab signals={data?.opportunistic_signals ?? []} />}
        {tab === 'protocols' && (
          <ProtocolsTab protocols={data?.protocols ?? []} categories={data?.protocols_by_category ?? {}} />
        )}
        {tab === 'chains' && <ChainsTab chains={data?.chains ?? []} />}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-300">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}

function OverviewTab({ data }: { data: Overview }) {
  const cats = Object.entries(data.protocols_by_category).sort((a, b) => b[1] - a[1]);
  const funnel = Object.entries(data.opportunity_funnel).sort((a, b) => b[1] - a[1]);
  const topStable = data.top_stable_yields.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Protocols by category
        </h3>
        <div className="space-y-2">
          {cats.map(([cat, n]) => (
            <div
              key={cat}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
            >
              <span
                className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded border ${
                  CATEGORY_COLORS[cat] ?? 'bg-gray-50 text-gray-700 border-gray-200'
                }`}
              >
                {cat.replace('_', ' ')}
              </span>
              <span className="font-medium tabular-nums text-gray-900">{n}</span>
            </div>
          ))}
          {cats.length === 0 && (
            <div className="text-xs text-gray-400">No protocols active.</div>
          )}
        </div>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Revenue opportunity funnel
        </h3>
        <div className="space-y-2">
          {funnel.map(([s, n]) => (
            <div
              key={s}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
            >
              <span className="text-gray-700 capitalize">{s.replace('_', ' ')}</span>
              <span className="font-medium tabular-nums text-gray-900">{n}</span>
            </div>
          ))}
          {funnel.length === 0 && <div className="text-xs text-gray-400">No opportunities discovered yet.</div>}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Top stablecoin yields
        </h3>
        <div className="space-y-2">
          {topStable.map((y, i) => (
            <div
              key={`${y.protocol_slug}-${y.chain}-${y.symbol}-${i}`}
              className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{y.symbol}</div>
                <div className="text-[10px] text-gray-500">
                  {y.protocol_slug} · {y.chain} · TVL {fmtUsd(y.tvl_usd)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-emerald-700 tabular-nums">{fmtPct(y.apy_pct)}</div>
                <div className="text-[10px] text-emerald-600">APY</div>
              </div>
            </div>
          ))}
          {topStable.length === 0 && (
            <div className="text-xs text-gray-400">Awaiting first yield snapshot.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function YieldsTab({ yields, stable }: { yields: Yield[]; stable: Yield[] }) {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Top stablecoin yields ({stable.length})
          </h3>
          <YieldTable rows={stable} accent="emerald" />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Top all-asset yields ({yields.length})
          </h3>
          <YieldTable rows={yields} accent="amber" />
        </div>
      </div>
    </div>
  );
}

function YieldTable({ rows, accent }: { rows: Yield[]; accent: 'emerald' | 'amber' }) {
  if (rows.length === 0) {
    return <div className="text-xs text-gray-400">No yields collected yet.</div>;
  }
  const apyClass = accent === 'emerald' ? 'text-emerald-700' : 'text-amber-700';
  return (
    <div className="space-y-1.5">
      {rows.map((y, i) => (
        <div
          key={`${y.protocol_slug}-${y.chain}-${y.symbol}-${i}`}
          className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 hover:border-gray-200 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900 truncate">{y.symbol}</div>
            <div className="text-[10px] text-gray-500 truncate">
              {y.protocol_slug} · {y.chain}
              {y.il_risk && y.il_risk !== 'no' ? ` · IL: ${y.il_risk}` : ''}
            </div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <div className={`text-sm font-semibold tabular-nums ${apyClass}`}>{fmtPct(y.apy_pct)}</div>
            <div className="text-[10px] text-gray-500">TVL {fmtUsd(y.tvl_usd)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalsTab({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return <div className="text-xs text-gray-400">No active opportunistic signals.</div>;
  }
  return (
    <div className="space-y-2">
      {signals.map((s) => (
        <div
          key={s.id}
          className="flex items-start justify-between border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                {s.signal_type}
              </span>
              <span className="text-[10px] text-gray-500">{s.source}</span>
              <span className="text-[10px] text-gray-400">· {s.chain}</span>
            </div>
            <div className="text-sm font-medium text-gray-900 truncate">{s.asset}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              status {s.status} · created {timeAgo(s.created_at)}
              {s.expires_at ? ` · expires ${timeAgo(s.expires_at)}` : ''}
            </div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <div className="text-sm font-semibold text-gray-900 tabular-nums">{fmtUsd(s.est_value_usd)}</div>
            <div className="text-[10px] text-gray-500">score {s.score}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProtocolsTab({
  protocols,
  categories,
}: {
  protocols: Protocol[];
  categories: Record<string, number>;
}) {
  const [filter, setFilter] = useState<string>('all');
  const list = filter === 'all' ? protocols : protocols.filter((p) => p.category === filter);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <FilterPill active={filter === 'all'} label={`All (${protocols.length})`} onClick={() => setFilter('all')} />
        {Object.entries(categories).map(([c, n]) => (
          <FilterPill
            key={c}
            active={filter === c}
            label={`${c.replace('_', ' ')} (${n})`}
            onClick={() => setFilter(c)}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((p) => (
          <div key={p.slug} className="border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{p.display_name}</div>
                <span
                  className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border mt-1 ${
                    CATEGORY_COLORS[p.category] ?? 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  {p.category.replace('_', ' ')}
                </span>
              </div>
              <a
                href={p.homepage_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-700"
              >
                <ExternalLink size={12} />
              </a>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed line-clamp-2">{p.short_description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.chains.slice(0, 4).map((c) => (
                <span key={c} className="text-[9px] bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded">
                  {c}
                </span>
              ))}
              {p.chains.length > 4 && (
                <span className="text-[9px] text-gray-400">+{p.chains.length - 4}</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
              {p.permissionless && <span className="text-emerald-600">permissionless</span>}
              {p.open_source && <span className="text-sky-600">open-source</span>}
              {p.governance_token && <span className="text-amber-600">{p.governance_token}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors capitalize ${
        active
          ? 'bg-emerald-600 text-white border-emerald-600'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

function ChainsTab({ chains }: { chains: Chain[] }) {
  if (chains.length === 0) return <div className="text-xs text-gray-400">No chains configured.</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {chains.map((c) => (
        <div key={`${c.network}-${c.chain_id}`} className="border border-gray-100 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold text-gray-900 capitalize">{c.network}</div>
            <span className="text-[10px] text-gray-400">id {c.chain_id}</span>
          </div>
          <div className="text-[11px] text-gray-600">Token {c.token_symbol}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            block {c.last_scanned_block?.toLocaleString() ?? '—'}
            {c.last_scan_at ? ` · scanned ${timeAgo(c.last_scan_at)}` : ''}
          </div>
          {c.explorer_url && (
            <a
              href={c.explorer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900"
            >
              <ExternalLink size={10} />
              explorer
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
