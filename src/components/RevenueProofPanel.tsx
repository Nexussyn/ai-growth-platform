import { useEffect, useState } from 'react';
import { Receipt, ArrowUpRight, Clock, CheckCircle, AlertCircle, DollarSign, ExternalLink } from 'lucide-react';
import { edgeFetch } from '../lib/supabase';
import { Skeleton } from './Skeleton';

interface AuditSummary {
  total_revenue_recognized: number;
  total_commissions_due: number;
  total_commissions_paid: number;
  total_payout_queued: number;
  total_payout_executed: number;
  last_payout_tx_hash: string | null;
  last_settlement_at: string | null;
  event_count: number;
  recent_events: AuditEvent[];
}

interface AuditEvent {
  id: string;
  event_type: string;
  revenue_gross: number;
  payout_status: string;
  created_at: string;
  payout_tx_hash: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  executed: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <CheckCircle size={10} /> },
  queued: { bg: 'bg-blue-50', text: 'text-blue-700', icon: <Clock size={10} /> },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', icon: <Clock size={10} /> },
  failed: { bg: 'bg-red-50', text: 'text-red-700', icon: <AlertCircle size={10} /> },
};

export function RevenueProofPanel() {
  const [data, setData] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await edgeFetch('/api/revenue-proof');
        if (!res.ok) throw new Error('failed');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Receipt size={14} />
          <span>Revenue proof data unavailable</span>
        </div>
      </div>
    );
  }

  const metrics = [
    { label: 'Revenue Recognized', value: `$${data.total_revenue_recognized.toFixed(4)}`, icon: <DollarSign size={14} className="text-emerald-500" /> },
    { label: 'Commissions Due', value: `$${data.total_commissions_due.toFixed(4)}`, icon: <Receipt size={14} className="text-blue-500" /> },
    { label: 'Commissions Paid', value: `$${data.total_commissions_paid.toFixed(4)}`, icon: <CheckCircle size={14} className="text-emerald-500" /> },
    { label: 'Payout Queued', value: `$${data.total_payout_queued.toFixed(4)}`, icon: <Clock size={14} className="text-amber-500" /> },
    { label: 'Payout Executed', value: `$${data.total_payout_executed.toFixed(4)}`, icon: <ArrowUpRight size={14} className="text-emerald-500" /> },
    { label: 'Audit Events', value: String(data.event_count), icon: <Receipt size={14} className="text-gray-400" /> },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">Payment Proof & Revenue Verification</span>
        </div>
        {data.last_payout_tx_hash && (
          <a
            href={`https://basescan.org/tx/${data.last_payout_tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Last tx <ExternalLink size={10} />
          </a>
        )}
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {metrics.map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                {m.icon}
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">{m.label}</span>
              </div>
              <p className="text-sm font-bold text-gray-900">{m.value}</p>
            </div>
          ))}
        </div>

        {data.last_settlement_at && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock size={11} />
            <span>Last settlement: {new Date(data.last_settlement_at).toLocaleString()}</span>
          </div>
        )}

        {data.recent_events.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Audit Events</h4>
            <div className="divide-y divide-gray-50">
              {data.recent_events.map(ev => {
                const style = STATUS_STYLES[ev.payout_status] ?? STATUS_STYLES.pending;
                return (
                  <div key={ev.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                        {style.icon} {ev.payout_status}
                      </span>
                      <span className="text-xs text-gray-600">{ev.event_type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-900">${Number(ev.revenue_gross).toFixed(4)}</span>
                      <span className="text-[10px] text-gray-400">{new Date(ev.created_at).toLocaleDateString()}</span>
                      {ev.payout_tx_hash && (
                        <a
                          href={`https://basescan.org/tx/${ev.payout_tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
