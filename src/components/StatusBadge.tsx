interface StatusDotProps {
  status: 'healthy' | 'degraded' | 'down' | 'active' | 'idle' | 'maintenance' | 'unknown';
  label?: string;
}

const dotColor: Record<string, string> = {
  healthy: 'bg-emerald-500',
  active: 'bg-emerald-500',
  degraded: 'bg-amber-400',
  idle: 'bg-amber-400',
  down: 'bg-red-500',
  maintenance: 'bg-red-500',
  unknown: 'bg-gray-300',
};

const labelColor: Record<string, string> = {
  healthy: 'text-emerald-600',
  active: 'text-emerald-600',
  degraded: 'text-amber-600',
  idle: 'text-amber-600',
  down: 'text-red-600',
  maintenance: 'text-red-600',
  unknown: 'text-gray-500',
};

export function StatusDot({ status, label }: StatusDotProps) {
  const key = status in dotColor ? status : 'unknown';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor[key]}`} />
      {label && <span className={`text-xs font-medium ${labelColor[key]}`}>{label}</span>}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
}

const badgeStyle: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  healthy: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  idle: 'bg-amber-50 text-amber-700 border-amber-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  maintenance: 'bg-red-50 text-red-700 border-red-100',
  failed: 'bg-red-50 text-red-700 border-red-100',
  promoted: 'bg-blue-50 text-blue-700 border-blue-100',
  throttled: 'bg-orange-50 text-orange-700 border-orange-100',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = badgeStyle[status] ?? 'bg-gray-50 text-gray-600 border-gray-100';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {status}
    </span>
  );
}
