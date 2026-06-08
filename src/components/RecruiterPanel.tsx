import { UserPlus, Search, CheckCircle2, XCircle, FlaskConical, ArrowRight, Shield, Briefcase } from 'lucide-react';
import { useRecruitmentStatus } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { Skeleton } from './Skeleton';

const STAGE_CONFIG: Record<string, { color: string; icon: typeof Search; label: string }> = {
  discovered: { color: 'bg-gray-100 text-gray-600', icon: Search, label: 'Discovered' },
  inspecting: { color: 'bg-blue-100 text-blue-700', icon: Search, label: 'Inspecting' },
  evaluated: { color: 'bg-cyan-100 text-cyan-700', icon: CheckCircle2, label: 'Evaluated' },
  approved: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Approved' },
  sandbox: { color: 'bg-amber-100 text-amber-700', icon: FlaskConical, label: 'Sandbox' },
  active: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Active' },
  rejected: { color: 'bg-red-100 text-red-600', icon: XCircle, label: 'Rejected' },
};

export function RecruiterPanel() {
  const { data, loading, error } = useRecruitmentStatus();

  return (
    <Card>
      <CardHeader
        title="Agent Recruitment"
        subtitle="Discover, vet, onboard, activate"
        icon={<UserPlus size={15} />}
      />
      <CardBody className="space-y-4">
        {loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error && !data ? (
          <div className="text-sm text-gray-500 text-center py-4">Recruitment data unavailable</div>
        ) : (
          <>
            {/* Pipeline funnel */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Pipeline</p>
              <div className="flex items-center gap-1">
                {['discovered', 'inspecting', 'evaluated', 'approved', 'sandbox', 'active'].map((stage, i) => {
                  const count = data?.pipeline_summary?.[stage] ?? 0;
                  const cfg = STAGE_CONFIG[stage];
                  return (
                    <div key={stage} className="flex items-center gap-1 flex-1">
                      <div className={`flex-1 rounded-lg px-2 py-2 text-center ${cfg.color}`}>
                        <p className="text-lg font-bold">{count}</p>
                        <p className="text-[10px] font-medium truncate">{cfg.label}</p>
                      </div>
                      {i < 5 && <ArrowRight size={10} className="text-gray-300 shrink-0" />}
                    </div>
                  );
                })}
              </div>
              {(data?.pipeline_summary?.rejected ?? 0) > 0 && (
                <p className="text-xs text-red-500 mt-2 text-right">
                  {data?.pipeline_summary?.rejected} rejected
                </p>
              )}
            </div>

            {/* Active agents workforce */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Active Workforce ({data?.active_agents?.length ?? 0})
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {data?.active_agents?.map(a => (
                  <div key={a.agent_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                    <Briefcase size={11} className="text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-emerald-800 truncate">{a.agent_id}</p>
                      <p className="text-[10px] text-emerald-600">{a.role}</p>
                    </div>
                    <div className="ml-auto shrink-0">
                      <span className="text-[10px] font-bold text-emerald-700">{a.performance_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sandbox agents */}
            {(data?.sandbox_agents?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  In Sandbox ({data?.sandbox_agents?.length})
                </p>
                <div className="space-y-1">
                  {data?.sandbox_agents?.map(a => (
                    <div key={a.agent_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                      <div className="flex items-center gap-2">
                        <FlaskConical size={11} className="text-amber-600" />
                        <span className="text-xs font-medium text-amber-800">{a.agent_id}</span>
                        <span className="text-[10px] text-amber-600">{a.role}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Shield size={10} className="text-amber-500" />
                        <span className="text-[10px] font-bold text-amber-700">{a.security_score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent candidates */}
            {(data?.candidates?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Recent Candidates</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {data?.candidates?.slice(0, 8).map(c => {
                    const cfg = STAGE_CONFIG[c.pipeline_stage] ?? STAGE_CONFIG.discovered;
                    return (
                      <div key={c.id} className="rounded-lg border border-gray-100 px-3 py-2.5 bg-white">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-800">{c.role}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 line-clamp-1">{c.capability_description}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-gray-400">
                            Fit: <span className="font-medium text-gray-600">{c.capability_fit_score}</span>
                          </span>
                          <span className="text-[10px] text-gray-400">
                            Risk: <span className={`font-medium ${Number(c.security_risk_score) > 50 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {c.security_risk_score}
                            </span>
                          </span>
                          <span className="text-[10px] text-gray-400">
                            Value: <span className="font-medium text-gray-600">{c.expected_value_score}</span>
                          </span>
                        </div>
                        {c.rejection_reason && (
                          <p className="text-[10px] text-red-500 mt-1">{c.rejection_reason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(data?.candidates?.length ?? 0) === 0 && (
              <div className="text-center py-4">
                <Search size={20} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">Recruiter is scanning for suitable agent candidates...</p>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
