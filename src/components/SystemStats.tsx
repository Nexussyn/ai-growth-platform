import { BarChart3, MousePointerClick, Zap, Activity } from 'lucide-react';
import { useLoopStatus } from '../lib/hooks';
import { Skeleton } from './Skeleton';

interface MetricTileProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  textAccent?: string;
  loading?: boolean;
}

function MetricTile({ label, value, sub, icon, accent, textAccent = 'text-gray-900', loading }: MetricTileProps) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 flex items-start gap-4 border-gray-100`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-24 mt-1" />
        ) : (
          <p className={`text-2xl font-bold leading-tight mt-0.5 ${textAccent}`}>{value}</p>
        )}
        {sub && !loading && (
          <p className="text-xs mt-1 text-gray-400">{sub}</p>
        )}
      </div>
    </div>
  );
}

export function RevenueMetricTiles() {
  const { data: loop, loading: loopLoading } = useLoopStatus();

  const impressions = loop?.metrics.views ?? 0;
  const clicks = loop?.metrics.clicks ?? 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const iterations = loop?.iterations ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile
          label="Impressions"
          value={impressions.toLocaleString()}
          sub="DB-tracked views"
          icon={<BarChart3 size={18} className="text-gray-500" />}
          accent="bg-gray-50"
          loading={loopLoading}
        />
        <MetricTile
          label="Clicks"
          value={clicks.toLocaleString()}
          sub="Tracked interactions"
          icon={<MousePointerClick size={18} className="text-orange-500" />}
          accent="bg-orange-50"
          loading={loopLoading}
        />
        <MetricTile
          label="CTR"
          value={loopLoading ? '---' : `${ctr.toFixed(1)}%`}
          sub="Click-through rate"
          icon={<Zap size={18} className="text-cyan-500" />}
          accent="bg-cyan-50"
          loading={loopLoading}
        />
        <MetricTile
          label="Iterations"
          value={iterations.toLocaleString()}
          sub="Orchestrator cycles"
          icon={<Activity size={18} className="text-emerald-500" />}
          accent="bg-emerald-50"
          loading={loopLoading}
        />
      </div>
    </div>
  );
}
