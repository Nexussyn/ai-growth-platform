import { useEffect, useState } from 'react';
import { Bell, CheckCircle, XCircle, Clock, Send, RefreshCw } from 'lucide-react';
import { edgeFetch } from '../lib/supabase';
import { Skeleton } from './Skeleton';

interface NotificationStatus {
  notifications_sent: number;
  notifications_failed: number;
  notifications_pending: number;
  total_events: number;
  telegram_configured: boolean;
  last_event: { event_type: string; sent_at: string } | null;
  last_payout_event: { event_type: string; sent_at: string } | null;
  last_commission_event: { event_type: string; sent_at: string } | null;
  recent: Array<{ id: string; event_type: string; status: string; at: string }>;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  sent: <CheckCircle size={10} className="text-emerald-500" />,
  failed: <XCircle size={10} className="text-red-500" />,
  pending: <Clock size={10} className="text-amber-500" />,
};

export function NotificationsPanel() {
  const [data, setData] = useState<NotificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  async function load() {
    try {
      const res = await edgeFetch('/api/notifications/status');
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  async function handleRetry() {
    setRetrying(true);
    try {
      await edgeFetch('/api/notifications/retry', { method: 'POST' });
      await load();
    } catch { /* silent */ }
    setRetrying(false);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <Skeleton className="h-5 w-52" />
        <div className="grid grid-cols-3 gap-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Bell size={14} />
          <span>Notification status unavailable</span>
        </div>
      </div>
    );
  }

  function formatTime(ts: string | null) {
    if (!ts) return 'Never';
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">Telegram Notifications</span>
          {data.telegram_configured ? (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Connected</span>
          ) : (
            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Not Configured</span>
          )}
        </div>
        {data.notifications_failed > 0 && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            <RefreshCw size={11} className={retrying ? 'animate-spin' : ''} />
            Retry failed
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Send size={11} className="text-emerald-600" />
              <span className="text-[10px] text-emerald-700 uppercase tracking-wide font-medium">Sent</span>
            </div>
            <p className="text-lg font-bold text-emerald-900">{data.notifications_sent}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <XCircle size={11} className="text-red-500" />
              <span className="text-[10px] text-red-700 uppercase tracking-wide font-medium">Failed</span>
            </div>
            <p className="text-lg font-bold text-red-900">{data.notifications_failed}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-amber-500" />
              <span className="text-[10px] text-amber-700 uppercase tracking-wide font-medium">Pending</span>
            </div>
            <p className="text-lg font-bold text-amber-900">{data.notifications_pending}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Bell size={11} className="text-gray-500" />
              <span className="text-[10px] text-gray-600 uppercase tracking-wide font-medium">Total</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{data.total_events}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-gray-100 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-gray-400 uppercase">Last Event</p>
            <p className="text-xs font-medium text-gray-800 mt-0.5">{data.last_event?.event_type ?? 'None'}</p>
            <p className="text-[10px] text-gray-400">{formatTime(data.last_event?.sent_at ?? null)}</p>
          </div>
          <div className="border border-gray-100 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-gray-400 uppercase">Last Payout</p>
            <p className="text-xs font-medium text-gray-800 mt-0.5">{data.last_payout_event?.event_type ?? 'None'}</p>
            <p className="text-[10px] text-gray-400">{formatTime(data.last_payout_event?.sent_at ?? null)}</p>
          </div>
          <div className="border border-gray-100 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-gray-400 uppercase">Last Commission</p>
            <p className="text-xs font-medium text-gray-800 mt-0.5">{data.last_commission_event?.event_type ?? 'None'}</p>
            <p className="text-[10px] text-gray-400">{formatTime(data.last_commission_event?.sent_at ?? null)}</p>
          </div>
        </div>

        {data.recent.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Notifications</h4>
            <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {data.recent.map(ev => (
                <div key={ev.id} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    {STATUS_ICON[ev.status] ?? STATUS_ICON.pending}
                    <span className="text-xs text-gray-700">{ev.event_type}</span>
                  </div>
                  <span className="text-[10px] text-gray-400">{formatTime(ev.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
