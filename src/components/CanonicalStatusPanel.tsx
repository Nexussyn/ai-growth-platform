import { Activity, AlertTriangle, CheckCircle2, RefreshCw, WifiOff, ShieldCheck, Plug, Workflow } from 'lucide-react';
import { useCanonicalSnapshot } from '../lib/canonical';

function StatusDot({ ok, stale }: { ok: boolean; stale: boolean }) {
  const color = stale ? 'bg-amber-400' : ok ? 'bg-emerald-500' : 'bg-rose-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} ${ok && !stale ? 'animate-pulse' : ''}`} />;
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString();
}

export function CanonicalStatusPanel() {
  const { data, liveConnection, stale, bindingError, lastFetchedAt, refresh } = useCanonicalSnapshot(10_000);

  const status = stale && !liveConnection
    ? 'disconnected'
    : data.flags.coherence_ok
    ? 'coherent'
    : 'degraded';

  const statusLabel: Record<string, string> = {
    coherent: 'Canonical sources synchronized',
    degraded: 'Canonical sources degraded',
    disconnected: 'Live connection interrupted',
  };

  const statusColor: Record<string, string> = {
    coherent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    degraded: 'text-amber-700 bg-amber-50 border-amber-200',
    disconnected: 'text-rose-700 bg-rose-50 border-rose-200',
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-900">Canonical Runtime State</h3>
          <StatusDot ok={liveConnection && !stale} stale={stale} />
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className={`mb-4 px-3 py-2 rounded-lg border text-xs font-medium ${statusColor[status]}`}>
        <div className="flex items-center gap-2">
          {status === 'coherent' && <CheckCircle2 size={14} />}
          {status === 'degraded' && <AlertTriangle size={14} />}
          {status === 'disconnected' && <WifiOff size={14} />}
          <span>{statusLabel[status]}</span>
        </div>
        {bindingError && (
          <div className="mt-1 text-[11px] font-normal opacity-80 break-all">
            {bindingError}
          </div>
        )}
        <div className="mt-1 text-[10px] font-normal opacity-70">
          Last fetched: {fmtTime(lastFetchedAt)} · Generated: {fmtTime(data.generated_at)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Metric label="Routes" value={data.counts.canonical_routes_tracked} icon={<Workflow size={12} />} />
        <Metric label="Approvals" value={data.counts.canonical_approvals_recorded} icon={<ShieldCheck size={12} />} />
        <Metric label="Connectors" value={data.counts.connectors_registered} icon={<Plug size={12} />} />
        <Metric label="Open Violations" value={data.counts.open_violations} tone={data.counts.open_violations > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Health" empty="No health rows reported.">
          {data.lists.health.slice(0, 6).map((h, i) => (
            <Row
              key={`${h.subject_kind}:${h.subject_id}:${i}`}
              left={`${h.subject_kind}:${h.subject_id}`}
              right={h.ok ? 'ok' : h.severity}
              tone={h.ok ? 'ok' : h.severity === 'high' ? 'bad' : 'warn'}
              sub={h.error}
            />
          ))}
        </Section>

        <Section title="Routes" empty="No canonical routes registered.">
          {data.lists.routes.slice(0, 6).map((r) => (
            <Row
              key={r.route_key}
              left={r.route_key}
              right={r.status}
              tone={r.status === 'healthy' ? 'ok' : r.status === 'degraded' ? 'warn' : 'bad'}
              sub={r.last_error || `verified ${fmtTime(r.last_verified_at)}`}
            />
          ))}
        </Section>

        <Section title="Approvals" empty="No approval records yet.">
          {data.lists.approvals.slice(0, 6).map((a) => (
            <Row
              key={a.task_id}
              left={a.task_id}
              right={a.state}
              tone={a.state === 'approved' ? 'ok' : a.state === 'pending' ? 'warn' : 'bad'}
              sub={a.block_reason || a.approved_by || ''}
            />
          ))}
        </Section>

        <Section title="Connectors" empty="No connectors registered.">
          {data.lists.connectors.slice(0, 6).map((c) => (
            <Row
              key={c.connector_key}
              left={c.connector_key}
              right={c.free_first ? `${c.connector_kind} · free` : c.connector_kind}
              tone={c.status === 'approved' ? 'ok' : 'warn'}
              sub={`${c.auth_method} · ${c.timeout_ms}ms`}
            />
          ))}
        </Section>

        <Section title="Recent Events" empty="No recent audit events.">
          {data.lists.events.slice(0, 6).map((e, i) => (
            <Row
              key={`${e.task_id}:${i}`}
              left={e.action}
              right={fmtTime(e.timestamp)}
              tone="neutral"
              sub={`${e.agent_role} · ${e.task_id}`}
            />
          ))}
        </Section>

        <Section title="Open Violations" empty="No coherence violations open.">
          {data.lists.violations.slice(0, 6).map((v) => (
            <Row
              key={v.id}
              left={v.violation_kind}
              right={fmtTime(v.detected_at)}
              tone="bad"
              sub={v.subject}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Metric({ label, value, icon, tone = 'neutral' }: { label: string; value: number; icon?: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const toneClass: Record<string, string> = {
    ok: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rose-700',
    neutral: 'text-gray-900',
  };
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-xl font-semibold ${toneClass[tone]}`}>{value}</div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.filter((c) => c !== null && c !== undefined && c !== false).length > 0;
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">{title}</h4>
      <div className="space-y-1.5">
        {hasItems ? children : <div className="text-xs text-gray-400 italic">{empty}</div>}
      </div>
    </div>
  );
}

function Row({ left, right, sub, tone }: { left: string; right: string; sub?: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const toneBadge: Record<string, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    bad: 'bg-rose-50 text-rose-700 border-rose-200',
    neutral: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="min-w-0 flex-1">
        <div className="text-gray-900 font-medium truncate">{left}</div>
        {sub && <div className="text-gray-400 text-[10px] truncate">{sub}</div>}
      </div>
      <span className={`shrink-0 px-2 py-0.5 rounded-md border text-[10px] font-medium ${toneBadge[tone]}`}>
        {right || '—'}
      </span>
    </div>
  );
}
