import { useEffect, useState } from 'react';
import { Globe, RefreshCw, TrendingUp, Zap, AlertTriangle, CheckCircle, Clock, BarChart2, Activity } from 'lucide-react';
import { SubsystemHealthPanel } from './SubsystemHealthPanel';
import { PhaseGatePanel } from './PhaseGatePanel';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const RUNTIME_URL = `${SUPABASE_URL}/functions/v1/open-world-runtime`;

interface RuntimeStatus {
  mode?: string;
  cycle?: number;
  phase_gate_passing?: boolean;
  events_persisted?: number;
  events_lost?: number;
  db_writes?: number;
  total_successes?: number;
  total_failures?: number;
  telegram_ok?: boolean;
  subsystems_degraded?: number;
  auto_recoveries?: number;
  benchmark_classes_run?: number;
  last_cycle_ms?: number;
  dlq_depth?: number;
  queue_depth?: number;
  error?: string;
}

interface RecentEvent {
  id: string;
  event_type: string;
  agent: string;
  target: string;
  status: string;
  created_at: string;
}

interface DomainEvent extends RecentEvent {
  payload?: Record<string, unknown>;
}

interface MetricRow {
  metric_key: string;
  metric_value: number;
  updated_at: string;
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STATUS_DOT: Record<string, string> = {
  success:   'bg-emerald-400',
  completed: 'bg-emerald-400',
  failed:    'bg-red-400',
  error:     'bg-red-400',
  degraded:  'bg-amber-400',
  recovered: 'bg-blue-400',
  isolated:  'bg-red-600',
};

function EventRow({ ev }: { ev: RecentEvent }) {
  const dot = STATUS_DOT[ev.status] ?? 'bg-gray-300';
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700 truncate">{ev.event_type.replace(/_/g, ' ')}</span>
          <span className="text-[10px] text-gray-400 flex-shrink-0">{ev.agent}</span>
        </div>
        <p className="text-[10px] text-gray-400 truncate">{ev.target}</p>
      </div>
      <span className="text-[10px] text-gray-300 flex-shrink-0">{timeAgo(ev.created_at)}</span>
    </div>
  );
}

function StatTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: 'green' | 'red' | 'amber' | 'blue' }) {
  const colors = {
    green: 'text-emerald-600',
    red:   'text-red-500',
    amber: 'text-amber-600',
    blue:  'text-blue-600',
  };
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${accent ? colors[accent] : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

export function OpenWorldDashboard() {
  const [status, setStatus]   = useState<RuntimeStatus | null>(null);
  const [events, setEvents]   = useState<RecentEvent[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [tab, setTab] = useState<'overview' | 'events' | 'metrics' | 'subsystems' | 'gate'>('overview');

  async function loadData() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
    try {
      const [statusRes, eventsRes, metricsRes] = await Promise.all([
        fetch(`${RUNTIME_URL}/status`, { headers: { ...h, 'Content-Type': 'application/json' } }).catch(() => null),
        fetch(`${SUPABASE_URL}/rest/v1/domain_events?select=id,event_type,agent,target,status,created_at&order=created_at.desc&limit=30`, { headers: h }),
        fetch(`${SUPABASE_URL}/rest/v1/projection_metrics?select=metric_key,metric_value,updated_at&order=metric_key`, { headers: h }),
      ]);

      if (statusRes?.ok) setStatus(await statusRes.json());
      if (eventsRes.ok)  setEvents(await eventsRes.json() as DomainEvent[]);
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      setLastRefresh(new Date());
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
  }

  async function triggerCycle() {
    setTriggerLoading(true);
    try {
      await fetch(`${RUNTIME_URL}/cycle`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      });
      await new Promise(r => setTimeout(r, 1500));
      await loadData();
    } catch { /* non-blocking */ }
    finally { setTriggerLoading(false); }
  }

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 15000);
    return () => clearInterval(id);
  }, []);

  const successRate = (() => {
    const s = status?.total_successes ?? 0;
    const f = status?.total_failures ?? 0;
    const t = s + f;
    return t > 0 ? Math.round((s / t) * 100) : null;
  })();

  const TABS = [
    { id: 'overview'   as const, label: 'Overview',   icon: Globe },
    { id: 'subsystems' as const, label: 'Subsystems', icon: Activity },
    { id: 'gate'       as const, label: 'Phase Gate', icon: BarChart2 },
    { id: 'events'     as const, label: 'Events',     icon: Zap },
    { id: 'metrics'    as const, label: 'Metrics',    icon: TrendingUp },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
              <Globe size={13} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Open World Runtime</h3>
              <p className="text-[10px] text-gray-400">Autonomous · Self-healing · Continuous</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && !status.error && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Live
              </span>
            )}
            <button
              onClick={triggerCycle}
              disabled={triggerLoading}
              className="text-[10px] font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
            >
              <Zap size={10} />
              {triggerLoading ? 'Triggering…' : 'Trigger cycle'}
            </button>
            <button onClick={loadData} className="text-gray-400 hover:text-gray-700">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon size={10} />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {status?.error && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertTriangle size={13} />
                <span className="text-xs">/status endpoint not reachable — showing DB data only</span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Cycle #"           value={status?.cycle ?? '—'} />
              <StatTile label="Success rate"      value={successRate !== null ? `${successRate}%` : '—'} accent={successRate !== null ? (successRate >= 80 ? 'green' : successRate >= 50 ? 'amber' : 'red') : undefined} />
              <StatTile label="Events persisted"  value={status?.events_persisted ?? '—'} accent="green" />
              <StatTile label="Events lost"       value={status?.events_lost ?? '—'} accent={status?.events_lost ? 'red' : undefined} />
              <StatTile label="Cycle latency"     value={status?.last_cycle_ms ? `${status.last_cycle_ms}ms` : '—'} />
              <StatTile label="Queue depth"       value={status?.queue_depth ?? '—'} />
              <StatTile label="DLQ depth"         value={status?.dlq_depth ?? '—'} accent={status?.dlq_depth && status.dlq_depth > 10 ? 'amber' : undefined} />
              <StatTile label="Auto-recoveries"   value={status?.auto_recoveries ?? '—'} accent="blue" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                status?.phase_gate_passing ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
              }`}>
                {status?.phase_gate_passing
                  ? <CheckCircle size={16} className="text-emerald-500" />
                  : <Clock size={16} className="text-gray-400" />}
                <div>
                  <p className="text-xs font-semibold text-gray-900">{status?.phase_gate_passing ? 'Phase gate passing' : 'Phase gate pending'}</p>
                  <p className="text-[10px] text-gray-400">14 criteria tracked</p>
                </div>
              </div>
              <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                status?.telegram_ok ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
              }`}>
                <Zap size={16} className={status?.telegram_ok ? 'text-blue-500' : 'text-gray-400'} />
                <div>
                  <p className="text-xs font-semibold text-gray-900">Telegram {status?.telegram_ok ? 'connected' : 'not configured'}</p>
                  <p className="text-[10px] text-gray-400">Liveness alerts</p>
                </div>
              </div>
              <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                (status?.subsystems_degraded ?? 0) === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <Activity size={16} className={(status?.subsystems_degraded ?? 0) === 0 ? 'text-emerald-500' : 'text-amber-500'} />
                <div>
                  <p className="text-xs font-semibold text-gray-900">
                    {status?.subsystems_degraded ? `${status.subsystems_degraded} degraded` : 'All subsystems healthy'}
                  </p>
                  <p className="text-[10px] text-gray-400">Self-healing active</p>
                </div>
              </div>
            </div>

            {/* Recent events preview */}
            {events.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Recent events</p>
                <div className="divide-y divide-gray-50">
                  {events.slice(0, 6).map(ev => <EventRow key={ev.id} ev={ev} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUBSYSTEMS TAB */}
        {tab === 'subsystems' && <SubsystemHealthPanel />}

        {/* PHASE GATE TAB */}
        {tab === 'gate' && <PhaseGatePanel />}

        {/* EVENTS TAB */}
        {tab === 'events' && (
          <div>
            <p className="text-xs text-gray-500 mb-3">{events.length} recent domain events</p>
            {events.length === 0
              ? <p className="text-xs text-gray-400 text-center py-8">No events yet</p>
              : <div className="divide-y divide-gray-50">{events.map(ev => <EventRow key={ev.id} ev={ev} />)}</div>
            }
          </div>
        )}

        {/* METRICS TAB */}
        {tab === 'metrics' && (
          <div>
            <p className="text-xs text-gray-500 mb-3">{metrics.length} projection metrics</p>
            {metrics.length === 0
              ? <p className="text-xs text-gray-400 text-center py-8">No metrics yet</p>
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {metrics.map(m => (
                    <div key={m.metric_key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-gray-600 truncate">{m.metric_key.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-bold text-gray-900 ml-2 flex-shrink-0">{Number(m.metric_value).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}
      </div>

      {lastRefresh && (
        <div className="px-5 pb-4">
          <p className="text-[10px] text-gray-300 text-right">Last refresh: {lastRefresh.toLocaleTimeString()}</p>
        </div>
      )}
    </div>
  );
}
