import { useEffect, useState, useCallback } from 'react';
import {
  ArrowRightLeft,
  TrendingUp,
  Briefcase,
  Percent,
  RefreshCw,
  Zap,
  DollarSign,
  BarChart3,
  Bot,
  Layers,
  Target,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Summary = {
  total_contracts: number;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  total_commission_usd: number;
  total_gross_volume_usd: number;
  total_agent_payouts_usd: number;
  open_positions: number;
  total_deployed_usd: number;
  total_realized_pnl_usd: number;
  avg_commission_pct: number;
};

type Contract = {
  agent_slug: string;
  agent_type: string;
  commission_rate_pct: number;
  priority_tier: number;
  total_tasks_completed: number;
  total_commission_earned_usd: number;
  reliability_score: number;
  active: boolean;
};

type Task = {
  id: string;
  agent_slug: string;
  task_kind: string;
  task_summary: string;
  gross_value_usd: number;
  commission_usd: number;
  agent_net_usd: number;
  status: string;
  quality_score: number | null;
  assigned_at: string;
  completed_at: string | null;
};

type Position = {
  id: string;
  strategy_type: string;
  strategy_name: string;
  protocol_slug: string | null;
  chain: string;
  asset_in: string;
  amount_deployed_usd: number;
  expected_yield_pct: number;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  commission_on_pnl_pct: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  risk_score: number;
};

type Dashboard = {
  summary: Summary;
  contracts: Contract[];
  recent_tasks: Task[];
  positions: Position[];
  daily_stats: { date: string; tasks_completed: number; total_commission_usd: number; financial_pnl_usd: number }[];
  generated_at: string;
};

function fmtUsd(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  assigned: 'bg-sky-50 text-sky-700 border-sky-200',
  running: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-gray-50 text-gray-600 border-gray-200',
  open: 'bg-teal-50 text-teal-700 border-teal-200',
  closed: 'bg-slate-50 text-slate-600 border-slate-200',
};

const RISK_LABELS = ['', 'Very Low', 'Low', 'Medium', 'High', 'Very High'];

export function BrokerageCommissionPanel() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'tasks' | 'positions' | 'agents'>('overview');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: rpc } = await supabase.rpc('brokerage_dashboard');
    if (rpc) setData(rpc as Dashboard);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, [refresh]);

  const s = data?.summary;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-200 text-xs font-medium uppercase tracking-wider">
              <ArrowRightLeft size={14} />
              Agent Brokerage & Financial Engineering
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Commission Engine</h2>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Intermédiation entre agents IA, prélèvement de commissions sur chaque tâche, et ingénierie financière complexe (yield, arbitrage, LP).
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

        {/* Key stats */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MetricCard icon={<DollarSign size={13} />} label="Commissions" value={fmtUsd(s?.total_commission_usd)} />
          <MetricCard icon={<BarChart3 size={13} />} label="Volume brut" value={fmtUsd(s?.total_gross_volume_usd)} />
          <MetricCard icon={<Percent size={13} />} label="Taux moyen" value={`${(s?.avg_commission_pct ?? 15).toFixed(1)}%`} />
          <MetricCard icon={<Briefcase size={13} />} label="Positions ouvertes" value={String(s?.open_positions ?? 0)} sub={fmtUsd(s?.total_deployed_usd)} />
          <MetricCard icon={<TrendingUp size={13} />} label="P&L réalisé" value={fmtUsd(s?.total_realized_pnl_usd)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {([
          ['overview', 'Vue globale', <Zap key="o" size={12} />],
          ['tasks', `Tâches (${s?.total_tasks ?? 0})`, <Target key="t" size={12} />],
          ['positions', `Positions (${(data?.positions ?? []).length})`, <Layers key="p" size={12} />],
          ['agents', `Agents (${(data?.contracts ?? []).length})`, <Bot key="a" size={12} />],
        ] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'tasks' && <TasksTab tasks={data?.recent_tasks ?? []} />}
        {tab === 'positions' && <PositionsTab positions={data?.positions ?? []} />}
        {tab === 'agents' && <AgentsTab contracts={data?.contracts ?? []} />}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-300">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function OverviewTab({ data }: { data: Dashboard | null }) {
  const s = data?.summary;
  const daily = data?.daily_stats ?? [];
  const topAgent = data?.contracts?.[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Répartition revenus</h3>
        <div className="space-y-2">
          <RevenueLine label="Volume brut total" value={fmtUsd(s?.total_gross_volume_usd)} />
          <RevenueLine label="Commissions plateforme" value={fmtUsd(s?.total_commission_usd)} accent />
          <RevenueLine label="Versements aux agents" value={fmtUsd(s?.total_agent_payouts_usd)} />
          <RevenueLine label="P&L ingénierie financière" value={fmtUsd(s?.total_realized_pnl_usd)} accent />
          <RevenueLine label="Capital déployé (positions ouvertes)" value={fmtUsd(s?.total_deployed_usd)} />
        </div>
        {topAgent && (
          <div className="mt-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="text-[10px] font-medium text-amber-600 uppercase">Top Agent</div>
            <div className="text-sm font-semibold text-gray-900 mt-1">{topAgent.agent_slug}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">
              {topAgent.total_tasks_completed} tâches · {fmtUsd(topAgent.total_commission_earned_usd)} commissions · fiabilité {topAgent.reliability_score.toFixed(0)}%
            </div>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Historique quotidien</h3>
        {daily.length === 0 ? (
          <div className="text-xs text-gray-400">En attente des premiers résultats quotidiens.</div>
        ) : (
          <div className="space-y-2">
            {daily.map((d) => (
              <div key={d.date} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-700 font-medium">{d.date}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">{d.tasks_completed} tâches</span>
                  <span className="font-medium text-amber-700">{fmtUsd(d.total_commission_usd)}</span>
                  {Number(d.financial_pnl_usd) > 0 && (
                    <span className="font-medium text-emerald-700">+{fmtUsd(d.financial_pnl_usd)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RevenueLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ? 'text-amber-700' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

function TasksTab({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <div className="text-xs text-gray-400">Aucune tâche brokérée encore. Le tick automatique va bientôt en créer.</div>;
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[t.status] ?? STATUS_COLORS.pending}`}>
                {t.status}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{t.task_kind}</span>
              <span className="text-[10px] text-gray-400">{t.agent_slug}</span>
            </div>
            <div className="text-sm text-gray-900 truncate">{t.task_summary}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              assigné {timeAgo(t.assigned_at)}{t.completed_at ? ` · terminé ${timeAgo(t.completed_at)}` : ''}
              {t.quality_score !== null ? ` · qualité ${t.quality_score}` : ''}
            </div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <div className="text-sm font-semibold text-gray-900 tabular-nums">{fmtUsd(t.gross_value_usd)}</div>
            <div className="text-[10px] text-amber-700 font-medium">commission {fmtUsd(t.commission_usd)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PositionsTab({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return <div className="text-xs text-gray-400">Aucune position ouverte.</div>;
  return (
    <div className="space-y-2">
      {positions.map((p) => {
        const pnl = Number(p.status === 'open' ? p.unrealized_pnl_usd : p.realized_pnl_usd);
        const pnlColor = pnl > 0 ? 'text-emerald-700' : pnl < 0 ? 'text-rose-700' : 'text-gray-500';
        return (
          <div key={p.id} className="border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[p.status] ?? STATUS_COLORS.pending}`}>{p.status}</span>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{p.strategy_type.replace('_', ' ')}</span>
                  <span className="text-[10px] text-gray-400">risque {RISK_LABELS[p.risk_score] ?? '?'}</span>
                </div>
                <div className="text-sm font-medium text-gray-900">{p.strategy_name}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {p.chain} · {p.asset_in}{p.protocol_slug ? ` · ${p.protocol_slug}` : ''} · ouvert {timeAgo(p.opened_at)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-gray-900 tabular-nums">{fmtUsd(p.amount_deployed_usd)}</div>
                <div className="text-[10px] text-gray-500">{Number(p.expected_yield_pct).toFixed(1)}% APY attendu</div>
                <div className={`text-xs font-medium tabular-nums mt-0.5 ${pnlColor}`}>
                  {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)} {p.status === 'open' ? '(unreal.)' : '(réalisé)'}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentsTab({ contracts }: { contracts: Contract[] }) {
  if (contracts.length === 0) return <div className="text-xs text-gray-400">Aucun contrat de brokerage actif.</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {contracts.map((c) => (
        <div key={c.agent_slug} className="border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-900">{c.agent_slug}</span>
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
              {c.commission_rate_pct}% comm.
            </span>
          </div>
          <div className="text-[10px] text-gray-500">
            tier {c.priority_tier} · {c.total_tasks_completed} tâches · fiabilité {c.reliability_score.toFixed(0)}%
          </div>
          <div className="mt-1 text-xs font-medium text-amber-700 tabular-nums">
            {fmtUsd(c.total_commission_earned_usd)} gagnés
          </div>
        </div>
      ))}
    </div>
  );
}
