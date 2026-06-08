import {
  Activity, Brain, Zap, Shield, TrendingUp, Users, Clock,
  AlertTriangle, CheckCircle, XCircle, Radio, Loader2,
} from 'lucide-react';
import { useEngineState } from '../lib/hooks';
import { Skeleton } from './Skeleton';

const MODE_CONFIG: Record<string, { label: string; color: string; icon: typeof Activity; description: string }> = {
  learning: { label: 'Learning', color: 'bg-blue-500', icon: Brain, description: 'Observing metrics and collecting baseline data' },
  testing: { label: 'Testing', color: 'bg-amber-500', icon: Zap, description: 'Running experiments and evaluating variants' },
  recruiting: { label: 'Recruiting', color: 'bg-cyan-500', icon: Users, description: 'Discovering and onboarding new agents' },
  promoting: { label: 'Promoting', color: 'bg-emerald-500', icon: TrendingUp, description: 'Promoting winning variants to production' },
  expanding: { label: 'Expanding', color: 'bg-teal-500', icon: Radio, description: 'Expanding into new channels and segments' },
  settling: { label: 'Settling', color: 'bg-green-500', icon: CheckCircle, description: 'Processing confirmed payments' },
  reconciling: { label: 'Reconciling', color: 'bg-orange-500', icon: Shield, description: 'Resolving discrepancies in revenue data' },
  degraded: { label: 'Degraded', color: 'bg-red-500', icon: AlertTriangle, description: 'Some components unavailable' },
  initializing: { label: 'Initializing', color: 'bg-gray-400', icon: Loader2, description: 'Engine starting up' },
};

function ComponentStatusDot({ status }: { status: string }) {
  const color = status === 'healthy' ? 'bg-emerald-400' : status === 'degraded' ? 'bg-amber-400' : 'bg-gray-300';
  return <span className={`w-1.5 h-1.5 rounded-full ${color}`} />;
}

export function AutonomousEnginePanel() {
  const { data, loading, error } = useEngineState();

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 text-amber-600 text-sm">
          <AlertTriangle size={14} />
          <span>Engine state unavailable</span>
        </div>
      </div>
    );
  }

  const mode = data?.mode ?? 'initializing';
  const config = MODE_CONFIG[mode] ?? MODE_CONFIG.initializing;
  const Icon = config.icon;
  const components = data?.components_status ?? {};
  const degraded = data?.degraded_components ?? [];
  const heartbeatAge = data?.last_heartbeat_at
    ? Math.round((Date.now() - new Date(data.last_heartbeat_at).getTime()) / 1000)
    : null;
  const heartbeatHealthy = heartbeatAge !== null && heartbeatAge < 180;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Mode Banner */}
      <div className={`${config.color} px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Icon size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold">{config.label} Mode</h3>
            <p className="text-white/80 text-xs">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${heartbeatHealthy ? 'bg-white animate-pulse' : 'bg-red-300'}`} />
          <span className="text-white/80 text-xs">
            {heartbeatHealthy ? 'Alive' : heartbeatAge !== null ? `Stale (${heartbeatAge}s)` : 'Unknown'}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricTile label="Uptime" value={`${(data?.total_autonomous_hours ?? 0).toFixed(1)}h`} />
          <MetricTile label="Decisions" value={String(data?.decisions_made ?? 0)} />
          <MetricTile label="Expansions" value={String(data?.expansions_completed ?? 0)} />
          <MetricTile label="Agents" value={String(data?.agents_recruited ?? 0)} />
        </div>

        {/* Components Grid */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Subsystems</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {Object.entries(components).map(([name, status]) => (
              <div key={name} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-gray-50 text-xs">
                <ComponentStatusDot status={status as string} />
                <span className="text-gray-700 capitalize truncate">{name.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Degraded Warning */}
        {degraded.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-amber-800 font-medium">Degraded components</p>
              <p className="text-xs text-amber-700 mt-0.5">{degraded.join(', ')}</p>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {(data?.recent_jobs?.length ?? 0) > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recent Jobs</h4>
            <div className="space-y-1">
              {data!.recent_jobs.slice(0, 5).map((job, i) => (
                <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-50">
                  <span className="text-gray-700 font-mono">{job.job_name}</span>
                  <div className="flex items-center gap-2">
                    {job.duration_ms !== null && (
                      <span className="text-gray-400">{job.duration_ms}ms</span>
                    )}
                    <span className={job.status === 'completed' ? 'text-emerald-600' : job.status === 'failed' ? 'text-red-600' : 'text-amber-600'}>
                      {job.status === 'completed' ? <CheckCircle size={12} /> : job.status === 'failed' ? <XCircle size={12} /> : <Clock size={12} />}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
