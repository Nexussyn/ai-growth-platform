import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw, Zap } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

interface SubsystemRow {
  name: string;
  status: 'healthy' | 'degraded' | 'isolated';
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_reason: string | null;
  auto_recover_after: string | null;
  degraded_at: string | null;
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function recoverIn(ts: string | null): string {
  if (!ts) return '';
  const diff = Math.floor((new Date(ts).getTime() - Date.now()) / 1000);
  if (diff <= 0) return 'recovering…';
  if (diff < 60) return `in ${diff}s`;
  return `in ${Math.floor(diff / 60)}m`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  healthy:  { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200', dot: 'bg-emerald-400' },
  degraded: { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200',   dot: 'bg-amber-400'   },
  isolated: { bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-200',     dot: 'bg-red-500'     },
};

const SUBSYSTEM_LABELS: Record<string, string> = {
  discovery:        'Discovery',
  outreach:         'Outreach',
  execution:        'Execution',
  benchmark:        'Benchmark',
  telegram:         'Telegram',
  db:               'Database',
  connector_health: 'Connectors',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'healthy')  return <CheckCircle size={13} className="text-emerald-500" />;
  if (status === 'degraded') return <AlertTriangle size={13} className="text-amber-500" />;
  return <XCircle size={13} className="text-red-500" />;
}

function SubsystemCard({ row }: { row: SubsystemRow }) {
  const s = STATUS_STYLES[row.status] ?? STATUS_STYLES.healthy;
  const label = SUBSYSTEM_LABELS[row.name] ?? row.name;
  const recover = row.status !== 'healthy' ? recoverIn(row.auto_recover_after) : '';

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3 flex flex-col gap-1.5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${s.dot} ${row.status === 'healthy' ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-semibold ${s.text}`}>{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon status={row.status} />
          <span className={`text-[10px] font-medium uppercase tracking-wide ${s.text}`}>{row.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-0.5">
        <div className="text-[10px] text-gray-400">
          Last ok: <span className="text-gray-600">{timeAgo(row.last_success_at)}</span>
        </div>
        <div className="text-[10px] text-gray-400">
          Failures: <span className={`font-semibold ${row.consecutive_failures > 0 ? s.text : 'text-gray-600'}`}>{row.consecutive_failures}</span>
        </div>
        {row.status !== 'healthy' && row.failure_reason && (
          <div className="col-span-2 text-[10px] text-gray-400 truncate">
            Reason: <span className="text-gray-600">{row.failure_reason}</span>
          </div>
        )}
        {recover && (
          <div className="col-span-2 text-[10px] text-gray-500 flex items-center gap-1">
            <RefreshCw size={9} className="animate-spin" />
            Auto-recover {recover}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryBar({ rows }: { rows: SubsystemRow[] }) {
  const healthy  = rows.filter(r => r.status === 'healthy').length;
  const degraded = rows.filter(r => r.status === 'degraded').length;
  const isolated = rows.filter(r => r.status === 'isolated').length;
  const total = rows.length || 1;
  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1 text-emerald-600"><CheckCircle size={12}/> {healthy} healthy</div>
      {degraded > 0 && <div className="flex items-center gap-1 text-amber-600"><AlertTriangle size={12}/> {degraded} degraded</div>}
      {isolated > 0 && <div className="flex items-center gap-1 text-red-600"><XCircle size={12}/> {isolated} isolated</div>}
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full flex">
          <div style={{ width: `${(healthy / total) * 100}%` }} className="bg-emerald-400" />
          <div style={{ width: `${(degraded / total) * 100}%` }} className="bg-amber-400" />
          <div style={{ width: `${(isolated / total) * 100}%` }} className="bg-red-500" />
        </div>
      </div>
    </div>
  );
}

export function SubsystemHealthPanel() {
  const [rows, setRows] = useState<SubsystemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/subsystem_health?select=name,status,consecutive_failures,last_success_at,last_failure_at,failure_reason,auto_recover_after,degraded_at&order=name`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setRows(data as SubsystemRow[]);
        setLastRefresh(new Date());
      }
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const allHealthy = rows.length > 0 && rows.every(r => r.status === 'healthy');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
            <Activity size={13} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Subsystem Health</h3>
            <p className="text-[10px] text-gray-400">Self-healing runtime state · auto-refresh 10s</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allHealthy && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
              <Zap size={10} /> All systems nominal
            </span>
          )}
          <button onClick={load} className="text-gray-400 hover:text-gray-700 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mb-4">
          <SummaryBar rows={rows} />
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">No subsystem data available</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(r => <SubsystemCard key={r.name} row={r} />)}
        </div>
      )}

      {lastRefresh && (
        <p className="text-[10px] text-gray-300 mt-3 text-right">Last refresh: {lastRefresh.toLocaleTimeString()}</p>
      )}
    </div>
  );
}
