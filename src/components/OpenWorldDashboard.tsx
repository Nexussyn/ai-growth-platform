import { useEffect, useState, useCallback } from 'react';
import {
  Globe, Wifi, WifiOff, CheckCircle, XCircle, Clock, Activity,
  Search, FileText, Send, Shield, Zap, RefreshCw, ExternalLink,
  AlertTriangle, Heart, Eye, Users, Cpu,
} from 'lucide-react';
import { Skeleton } from './Skeleton';

const RUNTIME_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/open-world-runtime`;
const hdrs = {
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

interface Capability { name: string; enabled: boolean; calls: number; successes: number; failures: number; last_success: string | null; last_failure: string | null; }
interface Connector { domain: string; state: string; failures: number; next_retry_at?: string | null; }
interface GovernedAgent { name: string; role: string; }
interface RuntimeEvent { id: string; event_type: string; source: string; target: string; status: string; payload_summary: string; created_at: string; payout_status: string | null; correlation_id?: string; }

interface DashboardData {
  outbound_connectivity: boolean;
  total_outbound_requests: number;
  success_rate: number;
  failure_rate: number;
  blocked_requests: number;
  discovered_opportunities: number;
  contracts_created: number;
  payouts_requested: number;
  payouts_received: number;
  last_successful_action: { event_type: string; target: string; created_at: string } | null;
  last_failed_action: { event_type: string; target: string; created_at: string; error_message?: string } | null;
  last_telegram_delivered: { event_type: string; sent_at: string } | null;
  governed_agents: GovernedAgent[];
  capabilities: Capability[];
  connectors: Connector[];
  recent_events: RuntimeEvent[];
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  supervisor: <Cpu size={12} />, discovery: <Search size={12} />, outreach: <Send size={12} />,
  execution: <Zap size={12} />, connector_health: <Heart size={12} />,
  reconciliation: <Shield size={12} />, visibility: <Eye size={12} />, payout: <ExternalLink size={12} />,
};

const CAP_ICONS: Record<string, React.ReactNode> = {
  web_search: <Search size={11} />, web_scrape: <Globe size={11} />, api_call: <Zap size={11} />,
  webhook_send: <Send size={11} />, telegram_notify: <Send size={11} />, recruit_agent: <Users size={11} />,
  create_contract: <FileText size={11} />, submit_bid: <FileText size={11} />,
  request_payout: <ExternalLink size={11} />, verify_settlement: <Shield size={11} />, reconcile_ledger: <Shield size={11} />,
};

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function OpenWorldDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningWorker, setRunningWorker] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${RUNTIME_URL}/dashboard`, { headers: hdrs });
      if (res.ok) setData(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 20000); return () => clearInterval(i); }, [load]);

  const runCycle = useCallback(async () => {
    setRunning(true);
    try { await fetch(`${RUNTIME_URL}/cycle`, { method: 'POST', headers: hdrs }); await load(); } catch { /* */ }
    setRunning(false);
  }, [load]);

  const runWorker = useCallback(async (w: string) => {
    setRunningWorker(w);
    try { await fetch(`${RUNTIME_URL}/${w}`, { method: 'POST', headers: hdrs }); await load(); } catch { /* */ }
    setRunningWorker(null);
  }, [load]);

  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <Skeleton className="h-6 w-64" />
      <div className="grid grid-cols-4 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
    </div>
  );

  const connected = data?.outbound_connectivity ?? false;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">Governed Autonomous Runtime</span>
          {connected ? (
            <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium"><Wifi size={9} /> Live</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium"><WifiOff size={9} /> NO OUTBOUND CONNECTIVITY</span>
          )}
          <span className="text-[10px] text-gray-400">{data?.governed_agents?.length ?? 8} agents</span>
        </div>
        <button onClick={runCycle} disabled={running} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
          <RefreshCw size={11} className={running ? 'animate-spin' : ''} />
          {running ? 'Running...' : 'Full Cycle'}
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* No connectivity */}
        {!connected && data && data.total_outbound_requests === 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
            <WifiOff size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">NO OUTBOUND CONNECTIVITY</p>
              <p className="text-xs text-red-600 mt-1">No real external requests have succeeded. Run a cycle to probe external systems.</p>
            </div>
          </div>
        )}

        {/* Governed agents */}
        {data?.governed_agents && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Users size={11} /> Governed Agents (8 max, no duplicates)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.governed_agents.map(a => {
                const recentEvent = data.recent_events.find(e => e.source === a.name);
                const lastActive = recentEvent ? timeAgo(recentEvent.created_at) : 'Idle';
                return (
                  <button key={a.name} onClick={() => runWorker(a.name === 'supervisor' ? 'cycle' : a.name === 'connector_health' ? 'health' : a.name)} disabled={!!runningWorker}
                    className="border border-gray-100 rounded-lg px-3 py-2.5 text-left hover:border-gray-300 transition-colors disabled:opacity-50 group">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-gray-400 group-hover:text-gray-600 transition-colors">{AGENT_ICONS[a.name] ?? <Activity size={12} />}</span>
                      <span className="text-[11px] font-semibold text-gray-800">{a.name}</span>
                      {runningWorker === a.name && <RefreshCw size={9} className="animate-spin text-gray-400" />}
                    </div>
                    <p className="text-[9px] text-gray-400 leading-tight line-clamp-2">{a.role}</p>
                    <p className="text-[9px] text-gray-300 mt-1">{lastActive}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Key metrics */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <Tile label="Outbound" value={data.total_outbound_requests} />
            <Tile label="Success" value={`${data.success_rate}%`} good={data.success_rate > 70} />
            <Tile label="Failed" value={`${data.failure_rate}%`} bad={data.failure_rate > 30} />
            <Tile label="Blocked" value={data.blocked_requests} />
            <Tile label="Discovered" value={data.discovered_opportunities} />
            <Tile label="Contracts" value={data.contracts_created} />
            <Tile label="Pay Req" value={data.payouts_requested} />
            <Tile label="Pay Rcvd" value={data.payouts_received} />
          </div>
        )}

        {/* Last real actions */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ActionCard label="Last Success" icon={<CheckCircle size={12} className="text-emerald-500" />} event={data.last_successful_action} />
            <ActionCard label="Last Failure" icon={<XCircle size={12} className="text-red-500" />} event={data.last_failed_action} />
            <ActionCard label="Last Telegram" icon={<Send size={12} className="text-blue-500" />} event={data.last_telegram_delivered ? { event_type: data.last_telegram_delivered.event_type, target: "telegram", created_at: data.last_telegram_delivered.sent_at } : null} />
          </div>
        )}

        {/* Connector health */}
        {data && data.connectors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Heart size={11} /> Connector Health</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {data.connectors.map(c => (
                <div key={c.domain} className={`border rounded-lg px-3 py-2 ${c.state === 'closed' ? 'border-emerald-100 bg-emerald-50/30' : c.state === 'half_open' ? 'border-amber-100 bg-amber-50/30' : 'border-red-100 bg-red-50/30'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${c.state === 'closed' ? 'bg-emerald-400' : c.state === 'half_open' ? 'bg-amber-400' : 'bg-red-400'}`} />
                    <span className="text-[10px] font-medium text-gray-700 truncate">{c.domain}</span>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">{c.state === 'closed' ? 'Healthy' : c.state === 'half_open' ? 'Recovering' : `Open (${c.failures} fails)`}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Capabilities */}
        {data && data.capabilities.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Eye size={11} /> Capabilities</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {data.capabilities.map(cap => {
                const rate = cap.calls > 0 ? Math.round((cap.successes / cap.calls) * 100) : 0;
                return (
                  <div key={cap.name} className="border border-gray-100 rounded-lg px-3 py-2 flex items-center gap-2">
                    <div className="text-gray-400">{CAP_ICONS[cap.name] ?? <Zap size={11} />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-gray-700 truncate">{cap.name}</p>
                      <p className="text-[9px] text-gray-400">{cap.calls > 0 ? `${cap.successes}/${cap.calls} (${rate}%)` : 'dormant'}</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${cap.calls > 0 ? (rate > 70 ? 'bg-emerald-400' : rate > 40 ? 'bg-amber-400' : 'bg-red-400') : 'bg-gray-200'}`} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent events */}
        {data && data.recent_events.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Activity size={11} /> Event Spine (Persisted)</h4>
            <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
              {data.recent_events.map(ev => (
                <div key={ev.id} className="flex items-center justify-between py-1.5 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {ev.status === 'success' ? <CheckCircle size={10} className="text-emerald-500 shrink-0" /> :
                     ev.status === 'failed' || ev.status === 'error' ? <XCircle size={10} className="text-red-500 shrink-0" /> :
                     ev.status === 'blocked' ? <AlertTriangle size={10} className="text-amber-500 shrink-0" /> :
                     <Clock size={10} className="text-gray-400 shrink-0" />}
                    <span className="text-[10px] font-medium text-gray-600 shrink-0">{ev.source}</span>
                    <span className="text-xs text-gray-700 truncate">{ev.event_type}</span>
                    <span className="text-[10px] text-gray-400 truncate hidden sm:inline">{ev.target.replace('https://', '').slice(0, 25)}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(ev.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data && data.recent_events.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400">No runtime events. Click "Full Cycle" to start autonomous execution.</div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, good, bad }: { label: string; value: string | number; good?: boolean; bad?: boolean }) {
  return (
    <div className={`rounded-xl p-2.5 space-y-0.5 ${bad ? 'bg-red-50' : good ? 'bg-emerald-50' : 'bg-gray-50'}`}>
      <span className="text-[9px] text-gray-500 uppercase tracking-wide">{label}</span>
      <p className={`text-sm font-bold ${bad ? 'text-red-900' : good ? 'text-emerald-900' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function ActionCard({ label, icon, event }: { label: string; icon: React.ReactNode; event: { event_type: string; target: string; created_at: string } | null }) {
  return (
    <div className="border border-gray-100 rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] text-gray-400 uppercase">{label}</span></div>
      {event ? (
        <><p className="text-xs font-medium text-gray-800 truncate">{event.event_type}</p><p className="text-[10px] text-gray-400 truncate">{event.target.replace('https://', '').slice(0, 35)} - {timeAgo(event.created_at)}</p></>
      ) : (<p className="text-xs text-gray-300">None yet</p>)}
    </div>
  );
}
