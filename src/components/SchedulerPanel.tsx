import { Timer, Play, AlertTriangle, CheckCircle2, XCircle, RotateCw, ArrowUpRight, Shield, Gauge } from 'lucide-react';
import { useSchedulerStatus } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { Skeleton } from './Skeleton';
import { ErrorState } from './States';

const PHASE_COLORS: Record<string, string> = {
  INIT: 'bg-gray-100 text-gray-700',
  STABILIZE: 'bg-blue-100 text-blue-700',
  INSTRUMENT: 'bg-cyan-100 text-cyan-700',
  EXPAND_ACQUISITION: 'bg-emerald-100 text-emerald-700',
  EXPAND_CHANNELS: 'bg-teal-100 text-teal-700',
  EXPAND_SEGMENTATION: 'bg-green-100 text-green-700',
  EXPAND_MONETIZATION: 'bg-amber-100 text-amber-700',
  DIVERSIFY: 'bg-orange-100 text-orange-700',
  PROMOTE_WINNERS: 'bg-rose-100 text-rose-700',
  RECONCILE: 'bg-slate-100 text-slate-700',
  REPEAT: 'bg-gray-100 text-gray-700',
};

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? 'bg-emerald-400'
    : status === 'running' ? 'bg-blue-400 animate-pulse'
    : status === 'failed' ? 'bg-red-400'
    : status === 'retrying' ? 'bg-amber-400 animate-pulse'
    : 'bg-gray-300';
  return <span className={`w-2 h-2 rounded-full inline-block ${color}`} />;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export function SchedulerPanel() {
  const { data, loading, error, refresh } = useSchedulerStatus();

  if (error && !data) return <ErrorState message="Scheduler status unavailable" />;

  const orch = data?.orchestrator;
  const phase = orch?.current_phase ?? 'INIT';
  const phaseColor = PHASE_COLORS[phase] ?? 'bg-gray-100 text-gray-700';

  return (
    <Card>
      <CardHeader
        title="Autonomous Scheduler"
        subtitle="Self-executing job engine"
        icon={<Timer size={15} />}
        action={
          <button onClick={refresh} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
            <RotateCw size={13} />
          </button>
        }
      />
      <CardBody className="space-y-4">
        {loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            {/* Dead scheduler alert */}
            {orch && !orch.watchdog_healthy && (orch.total_ticks ?? 0) > 0 && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 flex items-center gap-3 animate-pulse">
                <AlertTriangle size={18} className="text-red-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-800">Scheduler appears dead</p>
                  <p className="text-xs text-red-600">Last watchdog ping: {timeAgo(orch.watchdog_last_ping)}. System is not self-executing.</p>
                </div>
              </div>
            )}

            {/* Orchestrator state machine */}
            <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Gauge size={14} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">State Machine</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${phaseColor}`}>
                  {phase.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-gray-900">{orch?.total_ticks ?? 0}</p>
                  <p className="text-xs text-gray-400">Ticks</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">{timeAgo(orch?.last_tick_at ?? null)}</p>
                  <p className="text-xs text-gray-400">Last Tick</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    {orch?.watchdog_healthy ? (
                      <span className="text-emerald-600 flex items-center justify-center gap-1">
                        <CheckCircle2 size={12} /> Live
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center justify-center gap-1">
                        <AlertTriangle size={12} /> Stale
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">Watchdog</p>
                </div>
              </div>
            </div>

            {/* Active / failed runs */}
            {(data?.active_runs?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Play size={11} className="text-blue-500" />
                  <span className="text-xs font-medium text-blue-700">Running Now</span>
                </div>
                {data?.active_runs?.map(r => (
                  <div key={r.run_id} className="text-xs text-blue-600 flex items-center gap-2">
                    <StatusDot status="running" />
                    <span className="font-medium">{r.job_name}</span>
                    <span className="text-blue-400">attempt {r.attempt}</span>
                  </div>
                ))}
              </div>
            )}

            {(data?.failed_runs?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <XCircle size={11} className="text-red-500" />
                  <span className="text-xs font-medium text-red-700">Recent Failures</span>
                </div>
                {data?.failed_runs?.slice(0, 3).map(r => (
                  <div key={r.run_id} className="text-xs text-red-600 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <StatusDot status="failed" />
                      <span className="font-medium">{r.job_name}</span>
                    </span>
                    <span className="text-red-400 truncate max-w-[140px]">{r.error_message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pending promotions / canaries */}
            {(data?.pending_promotions?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUpRight size={11} className="text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">Canary Traffic</span>
                </div>
                {data?.pending_promotions?.slice(0, 4).map(c => (
                  <div key={c.id} className="text-xs text-amber-700 flex items-center justify-between">
                    <span>{c.target_type}: {c.target_id.slice(0, 8)}...</span>
                    <span className="font-medium">{c.traffic_pct}% traffic</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent promotions */}
            {(data?.recent_promotions?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield size={11} className="text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Promotion Decisions</span>
                </div>
                {data?.recent_promotions?.slice(0, 3).map(p => (
                  <div key={p.id} className="text-xs flex items-center justify-between">
                    <span className={`font-medium ${p.decision === 'promote' ? 'text-emerald-700' : p.decision === 'rollback' ? 'text-red-600' : 'text-gray-600'}`}>
                      {p.decision.toUpperCase()}
                    </span>
                    <span className="text-gray-400 truncate max-w-[180px]">{p.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent job runs */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Recent Runs</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data?.recent_runs?.slice(0, 12).map(r => (
                  <div key={r.run_id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={r.status} />
                      <span className="font-medium text-gray-700 truncate">{r.job_name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.duration_ms !== null && (
                        <span className="text-gray-400">{r.duration_ms}ms</span>
                      )}
                      <span className="text-gray-400">{timeAgo(r.completed_at ?? r.started_at)}</span>
                    </div>
                  </div>
                ))}
                {(!data?.recent_runs || data.recent_runs.length === 0) && (
                  <p className="text-xs text-gray-400 text-center py-3">No runs yet — scheduler will start on next tick</p>
                )}
              </div>
            </div>

            {/* Scheduled jobs list */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Scheduled Jobs</p>
              <div className="grid grid-cols-2 gap-1.5">
                {data?.scheduled_jobs?.map(j => (
                  <div key={j.id} className={`text-xs px-2.5 py-1.5 rounded-lg border ${j.enabled ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700 truncate">{j.job_name.replace(/_/g, ' ')}</span>
                      <span className="text-gray-400 text-[10px]">{j.cron_expression}</span>
                    </div>
                    {j.last_run_at && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(j.last_run_at)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
