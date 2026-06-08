import { HeartPulse, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { HealthCheck } from '../lib/types';

interface Props {
  checks: HealthCheck[];
  loading: boolean;
}

function formatComponentName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getOverallStatus(checks: HealthCheck[]): 'healthy' | 'degraded' | 'down' {
  if (checks.some(c => c.status === 'down')) return 'down';
  if (checks.some(c => c.status === 'degraded')) return 'degraded';
  return 'healthy';
}

function getStatusColor(status: HealthCheck['status']): string {
  switch (status) {
    case 'healthy': return 'emerald';
    case 'degraded': return 'amber';
    case 'down': return 'red';
  }
}

function getStatusIcon(status: HealthCheck['status']) {
  switch (status) {
    case 'healthy': return <CheckCircle className="w-4 h-4" />;
    case 'degraded': return <AlertTriangle className="w-4 h-4" />;
    case 'down': return <XCircle className="w-4 h-4" />;
  }
}

export function HealthPanel({ checks, loading }: Props) {
  const overallStatus = getOverallStatus(checks);
  const overallColor = getStatusColor(overallStatus);
  const statusMessage = overallStatus === 'healthy'
    ? 'All Systems Operational'
    : overallStatus === 'degraded'
    ? 'Degraded Performance'
    : 'System Down';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <HeartPulse className={`w-5 h-5 text-${overallColor}-600`} />
        <h2 className="text-lg font-semibold text-gray-900">System Health</h2>
      </div>

      <div className="px-6 py-4 border-b border-gray-100">
        <div className={`flex items-center gap-2 text-${overallColor}-700 font-medium`}>
          <div className={`w-2 h-2 rounded-full bg-${overallColor}-600`} />
          {statusMessage}
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {loading ? (
          <div className="px-6 py-8 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : checks.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No health data yet
          </div>
        ) : (
          checks.map(check => {
            const color = getStatusColor(check.status);
            return (
              <div key={check.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`text-${color}-600`}>
                    {getStatusIcon(check.status)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatComponentName(check.component)}
                    </p>
                    <p className={`text-xs text-${color}-700 capitalize`}>
                      {check.status}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  {getRelativeTime(check.checked_at)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
