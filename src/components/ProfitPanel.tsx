import {
  Shield, TrendingUp, AlertTriangle, GitBranch,
  CheckCircle, XCircle, ArrowRightLeft, Lock,
} from 'lucide-react';
import { useDeploymentStatus, useGrowthBlockers } from '../lib/hooks';
import { Skeleton } from './Skeleton';

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === 'critical'
    ? 'bg-red-50 text-red-700 border-red-200'
    : severity === 'high'
    ? 'bg-orange-50 text-orange-700 border-orange-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{severity}</span>;
}

export function ProfitPanel() {
  const { data: deployment, loading: dLoading } = useDeploymentStatus();
  const { data: blockers, loading: bLoading } = useGrowthBlockers();

  const loading = dLoading || bLoading;

  if (loading && !deployment) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  const blue = deployment?.blue;
  const green = deployment?.green;
  const openBlockers = blockers?.open_blockers ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold">Revenue Engine</h3>
            <p className="text-gray-400 text-xs">Operational status</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Lock size={12} className="text-emerald-400" />
          <span className="text-xs text-gray-400 font-mono">
            {deployment?.immutable_wallet ? 'Wallet locked' : 'Not configured'}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Status Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusTile label="Engine" value="Active" positive />
          <StatusTile label="Wallet" value={deployment?.immutable_wallet ? 'Locked' : 'Pending'} positive={!!deployment?.immutable_wallet} />
          <StatusTile label="Reconciliation" value="Running" positive />
          <StatusTile label="Governance" value="Enforced" positive />
        </div>

        {/* Blue/Green Deployment */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <GitBranch size={11} /> Blue/Green Deployment
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-blue-800">Blue (Active)</span>
                <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                  v{blue?.version_tag ?? deployment?.current_version ?? '?'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-blue-700">
                <span>{blue?.traffic_pct ?? 100}% traffic</span>
                <span className="text-blue-300">|</span>
                <span>{blue?.status ?? 'active'}</span>
              </div>
            </div>

            <div className={`border rounded-lg px-3 py-2.5 ${green ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${green ? 'text-emerald-800' : 'text-gray-400'}`}>
                  Green {green ? '(Validating)' : '(None)'}
                </span>
                {green && (
                  <span className="text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                    v{green.version_tag}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                {green ? (
                  <>
                    <span>{green.traffic_pct}% traffic</span>
                    <span className="text-gray-300">|</span>
                    <span>{green.status}</span>
                  </>
                ) : (
                  <span>No pending deployment</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Growth Blockers */}
        {openBlockers.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-amber-500" />
              Growth Blockers ({openBlockers.length})
            </h4>
            <div className="space-y-1.5">
              {openBlockers.slice(0, 4).map((b) => (
                <div key={b.id} className="bg-gray-50 rounded-lg px-3 py-2 flex items-start gap-2">
                  <SeverityBadge severity={b.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800">{b.description}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{b.resolution_action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {openBlockers.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <CheckCircle size={12} />
            <span>No growth blockers detected. Revenue path is clear.</span>
          </div>
        )}

        {/* Recent Mutations */}
        {(deployment?.recent_mutations?.length ?? 0) > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ArrowRightLeft size={11} /> Recent Mutations
            </h4>
            <div className="space-y-1">
              {deployment!.recent_mutations.slice(0, 4).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-mono">{m.mutation_type}</span>
                    <span className="text-gray-700">{m.target}</span>
                  </div>
                  <span className={
                    m.validation_status === 'passed' ? 'text-emerald-600' :
                    m.validation_status === 'failed' ? 'text-red-600' : 'text-amber-600'
                  }>
                    {m.validation_status === 'passed' ? <CheckCircle size={12} /> :
                     m.validation_status === 'failed' ? <XCircle size={12} /> :
                     <Shield size={12} />}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTile({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
      <p className={`text-sm font-semibold ${positive ? 'text-emerald-700' : 'text-amber-700'}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
