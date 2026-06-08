import { GitBranch, TrendingUp } from 'lucide-react';
import { DiversificationPhase } from '../lib/types';

interface Props {
  dimensions: DiversificationPhase[];
  loading: boolean;
}

const statusColors = {
  exploring: 'bg-amber-100 text-amber-800 border-amber-200',
  scaling: 'bg-blue-100 text-blue-800 border-blue-200',
  mature: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const formatDimension = (dimension: string): string => {
  return dimension
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const SkeletonRow = () => (
  <div className="px-6 py-4 border-b border-gray-200 animate-pulse">
    <div className="flex items-center justify-between gap-4">
      <div className="h-4 bg-gray-200 rounded w-24" />
      <div className="h-6 bg-gray-200 rounded w-16" />
      <div className="h-4 bg-gray-200 rounded w-12" />
      <div className="h-2 bg-gray-200 rounded w-20" />
    </div>
  </div>
);

export function DiversificationPanel(props: Props) {
  const { dimensions, loading } = props;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Diversification</h2>
      </div>

      <div className="divide-y divide-gray-200">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : dimensions.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No diversification dimensions available
          </div>
        ) : (
          dimensions.map(phase => (
            <div key={phase.id} className="px-6 py-4">
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {formatDimension(phase.dimension)}
                  </p>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    statusColors[phase.status]
                  }`}
                >
                  {phase.status.charAt(0).toUpperCase() + phase.status.slice(1)}
                </span>

                <div className="flex items-center gap-4 min-w-fit">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {phase.active_variants_count}
                    </span>
                  </div>

                  <div className="w-20">
                    <div className="bg-gray-200 rounded h-2 overflow-hidden">
                      <div
                        className="bg-gray-600 h-full rounded transition-all"
                        style={{
                          width: `${Math.min(100, phase.allocated_traffic_pct)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-right">
                      {phase.allocated_traffic_pct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
