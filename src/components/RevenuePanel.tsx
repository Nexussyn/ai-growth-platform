import { TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { useRevenueStreams } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { SkeletonRows } from './Skeleton';
import { ErrorState, EmptyState } from './States';

const STREAM_LABELS: Record<string, string> = {
  x402_api: 'x402 API',
  agentic_market: 'Agentic Market',
  pyrimid_affiliate: 'Pyramid Affiliate',
  data_dao: 'Data DAO',
  ime_share: 'IME Share',
};

export function RevenuePanel() {
  const { data, loading, error } = useRevenueStreams();

  const activeCount = data ? data.filter(r => r.payment_status === 'confirmed').length : 0;

  return (
    <Card>
      <CardHeader
        title="Revenue Streams"
        subtitle="All stream types · operational status"
        icon={<TrendingUp size={15} />}
        action={
          !loading && data && data.length > 0 ? (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
              {activeCount} confirmed
            </span>
          ) : undefined
        }
      />
      <CardBody>
        {loading && <SkeletonRows rows={5} />}
        {!loading && error && (
          <ErrorState message="Revenue data restricted to service role — not accessible from client" />
        )}
        {!loading && !error && (!data || data.length === 0) && (
          <EmptyState
            icon={<TrendingUp size={24} />}
            message="No revenue records yet"
          />
        )}
        {!loading && !error && data && data.length > 0 && (
          <div className="space-y-2">
            {data.map((stream) => {
              const isConfirmed = stream.payment_status === 'confirmed';
              return (
                <div
                  key={stream.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {STREAM_LABELS[stream.stream_type] ?? stream.stream_type}
                    </p>
                    <p className="text-xs text-gray-400">
                      {stream.transactions_count} txns &middot; {stream.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isConfirmed
                      ? <CheckCircle size={13} className="text-emerald-500" />
                      : <Clock size={13} className="text-amber-500" />}
                    <span className={`text-xs font-medium ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {isConfirmed ? 'Confirmed' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
