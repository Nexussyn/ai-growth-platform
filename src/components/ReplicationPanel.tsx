import { Globe, Server, Radio, Shield, Users, GitBranch } from 'lucide-react';
import { usePolledEdge } from '../lib/hooks';

interface InstanceData {
  instance_id: string;
  environment_name: string;
  deployment_url: string;
  status: string;
  safety_score: number;
  last_heartbeat_at: string;
  created_at: string;
}

interface ReplicationStatus {
  network_name: string;
  instances: InstanceData[];
  total_active: number;
}

interface RealtimeStatus {
  timestamp: string;
  orchestrator: { tick: number; phase: string; stalled: boolean; queue_depth: number };
  revenue: { confirmed_usdc: number; settlements: number };
  repairs: { pending: number; families: string[] };
  network: { active_instances: number };
  health: string;
}

export function ReplicationPanel() {
  const { data: instances } = usePolledEdge<ReplicationStatus>('/api/instances/public', 15000);
  const { data: realtime } = usePolledEdge<RealtimeStatus>('/api/realtime/status', 8000);

  const activeInstances = instances?.instances ?? [];
  const health = realtime?.health ?? 'unknown';
  const tick = realtime?.orchestrator?.tick ?? 0;
  const phase = realtime?.orchestrator?.phase ?? 'INIT';
  const pendingRepairs = realtime?.repairs?.pending ?? 0;
  const networkSize = realtime?.network?.active_instances ?? activeInstances.length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-teal-500" />
          <h3 className="text-sm font-semibold text-gray-900">Network & Replication</h3>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
            health === 'healthy' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            {health}
          </span>
        </div>
        <span className="text-xs text-gray-400">8s refresh</span>
      </div>

      {/* Network Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
        <div className="bg-white p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Server size={12} className="text-gray-400" />
            <p className="text-xs text-gray-500">Instances</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{networkSize}</p>
        </div>
        <div className="bg-white p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Radio size={12} className="text-gray-400" />
            <p className="text-xs text-gray-500">Tick</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{tick.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Shield size={12} className="text-gray-400" />
            <p className="text-xs text-gray-500">Health</p>
          </div>
          <p className={`text-xl font-bold ${health === 'healthy' ? 'text-emerald-700' : 'text-amber-700'}`}>{health}</p>
        </div>
      </div>

      {/* Phase & Status Bar */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <GitBranch size={12} />
          Phase: <span className="font-medium text-gray-700 uppercase">{phase}</span>
        </span>
        {pendingRepairs > 0 && (
          <span className="text-amber-600">{pendingRepairs} pending repairs</span>
        )}
        {realtime?.orchestrator?.stalled && (
          <span className="text-red-500 font-medium">STALLED</span>
        )}
      </div>

      {/* Instance List */}
      {activeInstances.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2">Active Instances</p>
          <div className="space-y-2">
            {activeInstances.map((inst) => (
              <div key={inst.instance_id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-mono font-medium text-gray-800">{inst.instance_id}</span>
                  <span className="text-xs text-gray-400">{inst.environment_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Safety: {inst.safety_score}%</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    inst.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}>{inst.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discovery Endpoints */}
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 mb-2">Public Discovery Endpoints</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            '/api/agent-manifest',
            '/api/discovery',
            '/.well-known/agent.json',
            '/api/capabilities',
            '/api/instances/public',
            '/api/realtime/status',
            '/api/jobs/public',
            '/api/health/public',
          ].map((ep) => (
            <div key={ep} className="text-xs font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded truncate">
              {ep}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
