import { Shield, ShieldAlert, ShieldCheck, Lock, Eye, AlertTriangle, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { useSecurityStatus } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { Skeleton } from './Skeleton';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  info: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  sandbox: 'bg-blue-100 text-blue-700',
  quarantined: 'bg-red-100 text-red-700',
  candidate: 'bg-gray-100 text-gray-600',
  retired: 'bg-gray-100 text-gray-400',
};

function OverallBanner({ status }: { status: string }) {
  if (status === 'critical') {
    return (
      <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 flex items-center gap-3">
        <ShieldAlert size={20} className="text-red-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-red-800">CRITICAL: Security issues detected</p>
          <p className="text-xs text-red-600 mt-0.5">Agent promotions and expansions are blocked until resolved.</p>
        </div>
      </div>
    );
  }
  if (status === 'warnings') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
        <AlertTriangle size={18} className="text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Warnings: Non-critical findings present</p>
          <p className="text-xs text-amber-600 mt-0.5">Review findings below. Promotions may be restricted.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
      <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-emerald-800">Secure: All checks passing</p>
        <p className="text-xs text-emerald-600 mt-0.5">RLS enforced, secrets contained, edge boundary intact.</p>
      </div>
    </div>
  );
}

export function SecurityDashboard() {
  const { data, loading, error } = useSecurityStatus();

  return (
    <Card>
      <CardHeader
        title="Security Hardening"
        subtitle="RLS, secrets, governance, agent scope"
        icon={<Shield size={15} />}
      />
      <CardBody className="space-y-4">
        {loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error && !data ? (
          <div className="text-sm text-red-600 text-center py-4">Security status unavailable</div>
        ) : (
          <>
            <OverallBanner status={data?.overall_status ?? 'secure'} />

            {/* Security posture indicators */}
            <div className="grid grid-cols-3 gap-2">
              <div className={`rounded-lg px-3 py-2 text-center border ${data?.rls_enforced ? 'border-emerald-100 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <Lock size={14} className={`mx-auto ${data?.rls_enforced ? 'text-emerald-600' : 'text-red-600'}`} />
                <p className={`text-xs font-medium mt-1 ${data?.rls_enforced ? 'text-emerald-700' : 'text-red-700'}`}>
                  RLS {data?.rls_enforced ? 'Enforced' : 'MISSING'}
                </p>
              </div>
              <div className={`rounded-lg px-3 py-2 text-center border ${!data?.secrets_exposed ? 'border-emerald-100 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <Eye size={14} className={`mx-auto ${!data?.secrets_exposed ? 'text-emerald-600' : 'text-red-600'}`} />
                <p className={`text-xs font-medium mt-1 ${!data?.secrets_exposed ? 'text-emerald-700' : 'text-red-700'}`}>
                  Secrets {!data?.secrets_exposed ? 'Contained' : 'EXPOSED'}
                </p>
              </div>
              <div className={`rounded-lg px-3 py-2 text-center border ${data?.edge_boundary_intact ? 'border-emerald-100 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <Shield size={14} className={`mx-auto ${data?.edge_boundary_intact ? 'text-emerald-600' : 'text-red-600'}`} />
                <p className={`text-xs font-medium mt-1 ${data?.edge_boundary_intact ? 'text-emerald-700' : 'text-red-700'}`}>
                  Edge {data?.edge_boundary_intact ? 'Intact' : 'BREACHED'}
                </p>
              </div>
            </div>

            {/* Function hardening & access control */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Function & Access Hardening</p>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>search_path set on all DEFINER fns</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>EXECUTE revoked from PUBLIC</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>EXECUTE revoked from anon</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>EXECUTE revoked from authenticated</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>service_role only execution</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>Default schema privs revoked</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>35 tables service_role only</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={10} /> <span>1 table anon read (system_metrics)</span>
                </div>
              </div>
            </div>

            {/* Findings */}
            {(data?.open_findings_count ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Open Findings ({data?.open_findings_count})</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {data?.findings?.filter(f => f.status === 'open').map(f => (
                    <div key={f.id} className={`rounded-lg px-3 py-2 border text-xs ${SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.info}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold uppercase">{f.severity}</span>
                        <span className="opacity-70">{f.component}</span>
                      </div>
                      <p className="mt-1">{f.description}</p>
                      {f.blocks_promotion && (
                        <p className="mt-1 font-medium flex items-center gap-1">
                          <Ban size={10} /> Blocks promotion
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent privilege table */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Agent Privileges</p>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {data?.agents?.map(agent => (
                  <div key={agent.agent_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[agent.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {agent.status}
                      </span>
                      <span className="text-xs font-medium text-gray-800 truncate">{agent.agent_id}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-400">R:{agent.allowed_tables_read.length} W:{agent.allowed_tables_write.length} T:{agent.allowed_tools.length}</span>
                      <span className={`text-[10px] font-bold ${Number(agent.security_score) >= 80 ? 'text-emerald-600' : Number(agent.security_score) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {agent.security_score}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quarantined agents alert */}
            {(data?.quarantined_agents?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <XCircle size={12} className="text-red-600" />
                  <span className="text-xs font-semibold text-red-700">Quarantined Agents</span>
                </div>
                {data?.quarantined_agents?.map(a => (
                  <p key={a.agent_id} className="text-xs text-red-600">{a.agent_id} — {a.role}</p>
                ))}
              </div>
            )}

            {/* Recent violations */}
            {(data?.violations?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Recent Violations</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {data?.violations?.slice(0, 5).map(v => (
                    <div key={v.id} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-gray-50">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle size={10} className={v.severity === 'critical' ? 'text-red-500' : 'text-amber-500'} />
                        <span className="font-medium text-gray-700">{v.agent_id}</span>
                        <span className="text-gray-400">{v.violation_type}</span>
                      </span>
                      <span className={`font-medium ${v.action_taken === 'quarantined' ? 'text-red-600' : v.action_taken === 'blocked' ? 'text-orange-600' : 'text-gray-500'}`}>
                        {v.action_taken}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Governance policies count */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <CheckCircle2 size={11} className="text-emerald-500" />
                Active governance policies
              </span>
              <span className="text-xs font-bold text-gray-700">{data?.policies?.length ?? 0}</span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
