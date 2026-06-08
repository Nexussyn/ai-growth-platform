import { Bot, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { AgentRunEntry } from '../lib/types';

interface Props {
  runs: AgentRunEntry[];
  loading: boolean;
}

const statusColors = {
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  timed_out: 'bg-amber-100 text-amber-800 border-amber-200',
};

const statusIcons = {
  completed: CheckCircle,
  running: Loader2,
  failed: XCircle,
  timed_out: Clock,
};

function AgentCard({ name, status }: { name: string; status: string }) {
  const StatusIcon = statusIcons[status as keyof typeof statusIcons] || CheckCircle;
  const colors = statusColors[status as keyof typeof statusColors] || statusColors.completed;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-700 truncate px-1">{name}</div>
        </div>
      </div>
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${colors}`}>
        <StatusIcon size={12} />
        {status}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function SkeletonLoader() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
      <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
        ))}
      </div>
    </div>
  );
}

export function AgentPyramidPanel(props: Props) {
  const { runs, loading } = props;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 p-6 flex items-center gap-2 bg-gray-50">
          <Bot size={20} className="text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Agent Pyramid</h2>
        </div>
        <SkeletonLoader />
      </div>
    );
  }

  const recentRuns = runs.slice(0, 10);
  const latestRunByAgent = Object.fromEntries(
    Array.from(new Map(runs.map(r => [r.agent_name, r])).entries())
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-200 p-6 flex items-center gap-2 bg-gray-50">
        <Bot size={20} className="text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Agent Pyramid</h2>
      </div>

      <div className="p-8">
        <div className="space-y-8">
          <div className="flex justify-center">
            <AgentCard name="supervisor" status={latestRunByAgent['supervisor']?.status || 'pending'} />
          </div>

          <div className="flex justify-center gap-12">
            <AgentCard name="finance" status={latestRunByAgent['finance']?.status || 'pending'} />
            <AgentCard name="marketing" status={latestRunByAgent['marketing']?.status || 'pending'} />
            <AgentCard name="growth" status={latestRunByAgent['growth']?.status || 'pending'} />
          </div>

          <div className="flex justify-center gap-12">
            <AgentCard name="variant_testing" status={latestRunByAgent['variant_testing']?.status || 'pending'} />
            <AgentCard name="devops" status={latestRunByAgent['devops']?.status || 'pending'} />
            <AgentCard name="support" status={latestRunByAgent['support']?.status || 'pending'} />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Runs</h3>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {recentRuns.length === 0 ? (
            <p className="text-sm text-gray-500">No runs yet</p>
          ) : (
            recentRuns.map((run, idx) => {
              const colors = statusColors[run.status as keyof typeof statusColors] || statusColors.completed;
              const StatusIcon = statusIcons[run.status as keyof typeof statusIcons] || CheckCircle;
              return (
                <div key={idx} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg text-sm">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="font-medium text-gray-700 truncate">{run.agent_name}</span>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border whitespace-nowrap ${colors}`}>
                      <StatusIcon size={12} />
                      {run.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-gray-600 ml-2">
                    {run.duration_ms !== null && (
                      <span className="text-xs">{(run.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    <span className="text-xs whitespace-nowrap">{formatRelativeTime(run.created_at)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
