import { RefreshCw, Network, Trophy, TrendingUp } from 'lucide-react';
import { useLoopStatus } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from './Skeleton';
import { ErrorState } from './States';
import type { Variant } from '../lib/types';

function scoreVariant(v: Variant): number {
  return v.revenue_per_view * 1000 + v.conversion_rate * 2.0 + v.click_through_rate * 0.5 + v.share_score * 0.1;
}

function VariantRow({ v, rank }: { v: Variant; rank: number }) {
  const isWinner = rank === 0;
  return (
    <div
      className={`rounded-xl px-4 py-3 border transition-colors ${
        isWinner
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-gray-100 bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isWinner && <Trophy size={13} className="text-emerald-600 shrink-0" />}
          <p className={`text-sm font-semibold truncate ${isWinner ? 'text-emerald-800' : 'text-gray-800'}`}>
            {v.title}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {v.roi_label && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isWinner ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {v.roi_label}
            </span>
          )}
          {v.status && <StatusBadge status={v.status} />}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-2 line-clamp-1">{v.description}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {[
          { label: 'Score', value: scoreVariant(v).toFixed(1), highlight: isWinner },
          { label: 'CVR', value: `${(v.conversion_rate * 100).toFixed(1)}%`, highlight: false },
          { label: 'CTR', value: `${(v.click_through_rate * 100).toFixed(1)}%`, highlight: false },
          { label: 'Share', value: v.share_score, highlight: false },
        ].map(({ label, value, highlight }) => (
          <span
            key={label}
            className={`text-xs ${highlight ? 'font-bold text-emerald-700' : 'text-gray-500'}`}
          >
            {label}: {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function OrchestratorPanel() {
  const { data, loading, error, refresh } = useLoopStatus();

  const progress = data ? Math.min((data.iterations / 3) * 100, 100) : 0;

  const rankedVariants = data?.variants
    ? [...data.variants].sort((a, b) => scoreVariant(b) - scoreVariant(a))
    : [];

  const views          = data?.metrics.views  ?? 0;
  const clicks         = data?.metrics.clicks ?? 0;

  return (
    <Card>
      <CardHeader
        title="Orchestrator Loop"
        subtitle="RPV-optimised variant selection"
        icon={<Network size={15} />}
        action={
          <button
            onClick={refresh}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
        }
      />
      <CardBody className="space-y-4">
        {error && <ErrorState message="Could not reach /loop/status endpoint" />}

        {/* Iteration progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500 font-medium">
              Iterations: {loading ? '…' : `${data?.iterations ?? 0} / 3`}
            </span>
            {!loading && data && (
              <span className={`text-xs font-medium ${data.iterations >= 3 ? 'text-emerald-600' : 'text-gray-400'}`}>
                {data.iterations >= 3 ? 'Complete' : 'Running'}
              </span>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-2 w-full" />
          ) : (
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* DB-backed counters — operational metrics only */}
        {!loading && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Impressions', value: views.toLocaleString(), em: false },
              { label: 'Clicks', value: clicks.toLocaleString(), em: false },
            ].map(({ label, value, em }) => (
              <div key={label} className={`rounded-lg px-3 py-2.5 ${em ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className={`text-sm font-semibold mt-0.5 ${em ? 'text-emerald-800' : 'text-gray-800'}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ranked variant list */}
        {!loading && rankedVariants.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-gray-400" />
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Variants ranked by RPV
              </p>
            </div>
            {rankedVariants.map((v, i) => (
              <VariantRow key={v.id} v={v} rank={i} />
            ))}
          </div>
        )}

        {!loading && rankedVariants.length === 0 && !error && (
          <p className="text-xs text-gray-400 text-center py-2">No variants generated yet</p>
        )}
      </CardBody>
    </Card>
  );
}
