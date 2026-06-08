import { Activity, Clock, AlertCircle, CheckCircle2, Gauge, Wrench } from 'lucide-react';
import { useOrchestratorLive } from '../lib/hooks';

export function LiveOrchestratorPanel() {
  const { data, loading } = useOrchestratorLive();

  if (loading && !data) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-48 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  const state = data?.state ?? {};
  const heartbeats = data?.heartbeats ?? [];
  const repairs = data?.pending_repairs ?? [];
  const recentJobs = data?.recent_jobs ?? [];

  const totalTicks = Number(state.total_ticks ?? 0);
  const lastTickAt = state.last_tick_at ? new Date(String(state.last_tick_at)) : null;
  const stalledFor = Number(state.stalled_for_seconds ?? 0);
  const currentPhase = String(state.current_phase ?? 'INIT');
  const lastAction = String(state.last_action ?? 'none');
  const queueDepth = Number(state.queue_depth ?? 0);

  const latestHeartbeat = heartbeats[0];
  const isStalled = stalledFor > 120;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className={isStalled ? 'text-red-500' : 'text-emerald-500'} />
          <h3 className="text-sm font-semibold text-gray-900">Live Orchestrator</h3>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${isStalled ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {isStalled ? 'STALLED' : 'RUNNING'}
          </span>
        </div>
        <span className="text-xs text-gray-400">8s refresh</span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <div className="bg-white p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Total Ticks</p>
          <p className="text-xl font-bold text-gray-900">{totalTicks.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Phase</p>
          <p className="text-sm font-bold text-gray-900 uppercase">{currentPhase}</p>
        </div>
        <div className="bg-white p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Queue Depth</p>
          <p className="text-xl font-bold text-gray-900">{queueDepth}</p>
        </div>
        <div className="bg-white p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Pending Repairs</p>
          <p className={`text-xl font-bold ${repairs.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{repairs.length}</p>
        </div>
      </div>

      {/* Last Tick Info */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          Last tick: {lastTickAt ? formatRelative(lastTickAt) : 'never'}
        </span>
        <span className="flex items-center gap-1">
          <Gauge size={12} />
          Action: {lastAction}
        </span>
        {stalledFor > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <AlertCircle size={12} />
            Stalled: {stalledFor}s
          </span>
        )}
      </div>

      {/* Recent Heartbeats */}
      {heartbeats.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2">Recent Heartbeats</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {heartbeats.slice(0, 8).map((hb) => (
              <div key={hb.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 font-mono">#{hb.tick_number}</span>
                <span className="text-gray-500">{hb.last_action || 'tick'}</span>
                <span className="text-gray-400">{hb.completed_jobs}ok / {hb.failed_jobs}err</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${hb.finished_at ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {hb.finished_at ? 'done' : 'running'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Repairs */}
      {repairs.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
            <Wrench size={12} className="text-amber-500" />
            Active Repairs
          </p>
          <div className="space-y-1">
            {repairs.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 font-medium">{r.failure_family}</span>
                <span className={`px-1.5 py-0.5 rounded ${r.priority > 7 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                  P{r.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2">Recent Jobs</p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {recentJobs.slice(0, 6).map((j, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 font-mono">{j.job_name}</span>
                <span className={`flex items-center gap-1 ${j.status === 'completed' ? 'text-emerald-600' : j.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
                  {j.status === 'completed' ? <CheckCircle2 size={10} /> : j.status === 'failed' ? <AlertCircle size={10} /> : null}
                  {j.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelative(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
