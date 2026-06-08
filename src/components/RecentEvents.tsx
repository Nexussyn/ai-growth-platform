import { Clock, ArrowRightLeft } from 'lucide-react';
import { useRecentApiCalls } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { StatusBadge } from './StatusBadge';
import { SkeletonRows } from './Skeleton';
import { ErrorState, EmptyState } from './States';

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const AGENT_COLORS: Record<string, string> = {
  trading: 'bg-blue-100 text-blue-700',
  marketing: 'bg-purple-100 text-purple-700',
  support: 'bg-teal-100 text-teal-700',
  finance: 'bg-emerald-100 text-emerald-700',
  devops: 'bg-orange-100 text-orange-700',
};

export function RecentEventsPanel() {
  const { data, loading, error } = useRecentApiCalls();

  return (
    <Card>
      <CardHeader
        title="Recent API Events"
        subtitle="Latest calls from api_calls table"
        icon={<Clock size={15} />}
      />
      <CardBody>
        {loading && <SkeletonRows rows={6} />}
        {!loading && error && (
          <ErrorState message="api_calls restricted to service role — not visible from client" />
        )}
        {!loading && !error && (!data || data.length === 0) && (
          <EmptyState icon={<ArrowRightLeft size={24} />} message="No API calls recorded yet" />
        )}
        {!loading && !error && data && data.length > 0 && (
          <div className="space-y-1.5">
            {data.map((call) => (
              <div
                key={call.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                <span className="text-xs text-gray-400 tabular-nums w-16 shrink-0">
                  {formatTs(call.created_at)}
                </span>
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    AGENT_COLORS[call.agent_type] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {call.agent_type}
                </span>
                <span className="text-xs text-gray-600 font-mono truncate flex-1">
                  {call.endpoint}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{call.symbol}</span>
                <StatusBadge status={call.payment_status} />
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
