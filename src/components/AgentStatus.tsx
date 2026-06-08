import { Bot } from 'lucide-react';
import { useAgentStatuses } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { StatusBadge } from './StatusBadge';
import { SkeletonRows } from './Skeleton';
import { ErrorState, EmptyState } from './States';

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatRelative(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const AGENT_LABELS: Record<string, string> = {
  supervisor: 'Supervisor',
  trading: 'Trading Agent',
  marketing: 'Marketing Agent',
  growth: 'Growth Agent',
  variant_testing: 'Variant Testing',
  support: 'Support Agent',
  finance: 'Finance Agent',
  devops: 'DevOps Agent',
  security: 'Security Agent',
  recruiter: 'Recruiter Agent',
};

export function AgentStatusPanel() {
  const { data, loading, error } = useAgentStatuses();

  const fallback = ['supervisor', 'marketing', 'growth', 'variant_testing', 'finance', 'devops', 'security', 'recruiter', 'support'];

  return (
    <Card>
      <CardHeader
        title="Agent Status"
        subtitle="Live agent health from Supabase"
        icon={<Bot size={15} />}
      />
      <CardBody>
        {loading && <SkeletonRows rows={5} />}
        {!loading && error && (
          <>
            <ErrorState message="Unable to reach Supabase — showing default agents" />
            <div className="mt-2 space-y-2">
              {fallback.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">{AGENT_LABELS[name] ?? name}</p>
                    <p className="text-xs text-gray-400">Status unavailable</p>
                  </div>
                  <StatusBadge status="unknown" />
                </div>
              ))}
            </div>
          </>
        )}
        {!loading && !error && (!data || data.length === 0) && (
          <EmptyState icon={<Bot size={24} />} message="No agents found" />
        )}
        {!loading && !error && data && data.length > 0 && (
          <div className="space-y-2">
            {data.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {AGENT_LABELS[agent.agent_name] ?? agent.agent_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    Uptime: {formatUptime(agent.uptime_seconds)} &middot;{' '}
                    {agent.requests_processed.toLocaleString()} requests &middot; Last:{' '}
                    {formatRelative(agent.last_request_at)}
                  </p>
                </div>
                <StatusBadge status={agent.status} />
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
