import { Rocket, Lightbulb, Users, Clock, Activity, Zap, Target, Shield, Radio, Briefcase } from 'lucide-react';
import { usePolledEdge } from '../lib/hooks';

interface FactoryStatus {
  mode: string;
  engines: Record<string, string>;
  workforce: { total_agents: number; by_status: Record<string, number>; stalled: number };
  recruitment: { total_candidates: number; by_stage: Record<string, number> };
  signals: { total: number; by_status: Record<string, number> };
  ideas: { total: number; by_status: Record<string, number>; last_new_idea: string | null; last_launch: string | null };
  portfolio: { total: number; by_status: Record<string, number> };
  revenue: { reconciled_net: number; destination: string };
  last_agent_approval: string | null;
}

export function ExpansionDashboard() {
  const { data } = usePolledEdge<FactoryStatus>('/api/factory/status', 8000);

  const workforce = data?.workforce ?? { total_agents: 0, by_status: {}, stalled: 0 };
  const recruitment = data?.recruitment ?? { total_candidates: 0, by_stage: {} };
  const signals = data?.signals ?? { total: 0, by_status: {} };
  const ideas = data?.ideas ?? { total: 0, by_status: {}, last_new_idea: null, last_launch: null };
  const portfolio = data?.portfolio ?? { total: 0, by_status: {} };
  const revenue = data?.revenue ?? { reconciled_net: 0, destination: '' };

  const timeSince = (iso: string | null) => {
    if (!iso) return 'never';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
    return `${Math.floor(ms / 3600000)}h ago`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-gray-900">Autonomous Venture Factory</h3>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded-full">LIVE</span>
      </div>

      {/* Top metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <Metric icon={<Users size={12} />} label="Total Agents" value={workforce.total_agents} />
        <Metric icon={<Zap size={12} />} label="Active" value={workforce.by_status.active ?? 0} />
        <Metric icon={<Radio size={12} />} label="Candidates" value={recruitment.total_candidates} />
        <Metric icon={<Shield size={12} />} label="Stalled" value={workforce.stalled} warn={workforce.stalled > 0} />
      </div>

      {/* Venture metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
        <Metric icon={<Lightbulb size={12} />} label="Signals" value={signals.total} />
        <Metric icon={<Target size={12} />} label="Ideas" value={ideas.total} />
        <Metric icon={<Briefcase size={12} />} label="Ventures" value={portfolio.total} />
      </div>

      {/* Recruitment Pipeline */}
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 mb-2">Recruitment Pipeline</p>
        <div className="flex gap-1 items-center">
          {['discovered', 'inspecting', 'evaluated', 'approved', 'sandbox', 'active'].map((stage) => (
            <div key={stage} className="flex-1 text-center">
              <div className="text-xs font-bold text-gray-900">{recruitment.by_stage[stage] ?? 0}</div>
              <div className="text-[10px] text-gray-400 truncate">{stage}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Idea Pipeline */}
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 mb-2">Idea Pipeline</p>
        <div className="flex gap-1 items-center">
          {['proposed', 'validated', 'launched', 'iterating', 'profitable', 'retired'].map((status) => (
            <div key={status} className="flex-1 text-center">
              <div className="text-xs font-bold text-gray-900">{ideas.by_status[status] ?? 0}</div>
              <div className="text-[10px] text-gray-400 truncate">{status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Timing and last events */}
      <div className="px-5 py-3 border-t border-gray-100 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-gray-400">Last new idea</p>
          <p className="text-xs font-medium text-gray-800">{timeSince(ideas.last_new_idea)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Last launch</p>
          <p className="text-xs font-medium text-gray-800">{timeSince(ideas.last_launch)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Last approval</p>
          <p className="text-xs font-medium text-gray-800">{timeSince(data?.last_agent_approval ?? null)}</p>
        </div>
      </div>

      {/* Engines status */}
      {data?.engines && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-1.5">Engines</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.engines).map(([name, status]) => (
              <span key={name} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                status === 'running' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status === 'running' ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                {name.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio */}
      {portfolio.total > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
          <span className="text-[10px] text-gray-400">Active: <span className="font-medium text-gray-700">{portfolio.by_status.active ?? 0}</span></span>
          <span className="text-[10px] text-gray-400">Profitable: <span className="font-medium text-emerald-700">{portfolio.by_status.profitable ?? 0}</span></span>
          <span className="text-[10px] text-gray-400">Retired: <span className="font-medium text-gray-500">{portfolio.by_status.retired ?? 0}</span></span>
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value, warn, prefix }: { icon: React.ReactNode; label: string; value: number; warn?: boolean; prefix?: string }) {
  return (
    <div className="bg-white p-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <span className="text-gray-400">{icon}</span>
        <p className="text-[10px] text-gray-500">{label}</p>
      </div>
      <p className={`text-lg font-bold ${warn ? 'text-amber-600' : 'text-gray-900'}`}>{prefix ?? ''}{value}</p>
    </div>
  );
}
