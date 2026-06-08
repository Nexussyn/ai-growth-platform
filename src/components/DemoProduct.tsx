import { useEffect, useState } from 'react';
import { Activity, Clock, DollarSign, Zap, AlertCircle } from 'lucide-react';
import { edgeFetch } from '../lib/supabase';
import { Skeleton } from './Skeleton';

interface RealEvent {
  event_type: string;
  timestamp: string;
  source: string;
  contract_id: string | null;
  amount: number | null;
  payout_status: string | null;
  summary: string;
}

interface RealActivity {
  last_event: RealEvent | null;
  total_events_24h: number;
  total_revenue_24h: number;
  active_contracts: number;
  pending_payouts: number;
  system_online: boolean;
}

export function DemoProduct() {
  const [data, setData] = useState<RealActivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await edgeFetch('/api/real-activity');
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
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <Skeleton className="h-6 w-56" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
        </div>
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!data || !data.system_online) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 text-gray-500">
          <AlertCircle size={16} />
          <span className="text-sm">No real production activity yet. Events will appear here as they occur.</span>
        </div>
      </div>
    );
  }

  const ev = data.last_event;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">Live Production Activity</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Real-time
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Zap size={11} className="text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Events (24h)</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{data.total_events_24h}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <DollarSign size={11} className="text-emerald-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Revenue (24h)</span>
            </div>
            <p className="text-lg font-bold text-gray-900">${data.total_revenue_24h.toFixed(4)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Activity size={11} className="text-blue-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Contracts</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{data.active_contracts}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-amber-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Pending Payouts</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{data.pending_payouts}</p>
          </div>
        </div>

        {ev && (
          <div className="border border-gray-100 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Real Event</h4>
              <span className="text-[10px] text-gray-400">{new Date(ev.timestamp).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-gray-400">Type</span>
                <p className="font-medium text-gray-900">{ev.event_type}</p>
              </div>
              <div>
                <span className="text-gray-400">Source</span>
                <p className="font-medium text-gray-900">{ev.source}</p>
              </div>
              {ev.amount !== null && (
                <div>
                  <span className="text-gray-400">Amount</span>
                  <p className="font-medium text-gray-900">${ev.amount.toFixed(4)} USDC</p>
                </div>
              )}
              {ev.contract_id && (
                <div>
                  <span className="text-gray-400">Contract</span>
                  <p className="font-medium text-gray-900 truncate">{ev.contract_id.slice(0, 8)}...</p>
                </div>
              )}
              {ev.payout_status && (
                <div>
                  <span className="text-gray-400">Payout Status</span>
                  <p className="font-medium text-gray-900">{ev.payout_status}</p>
                </div>
              )}
            </div>
            {ev.summary && (
              <p className="text-xs text-gray-500 pt-1 border-t border-gray-50">{ev.summary}</p>
            )}
          </div>
        )}

        {!ev && (
          <div className="text-center text-xs text-gray-400 py-4">
            Waiting for first production event...
          </div>
        )}
      </div>
    </div>
  );
}
