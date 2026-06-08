import { ShieldCheck, Lock, Globe, AlertTriangle, Gauge } from 'lucide-react';
import { useWalletConfig } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';

interface SecurityItem {
  label: string;
  detail: string;
  level: 'ok' | 'warn' | 'info';
  icon: React.ReactNode;
}

function useSecurityItems() {
  const { data: wallet } = useWalletConfig();
  const walletOk = wallet?.configured ?? false;

  const items: SecurityItem[] = [
    {
      label: 'Wallet address',
      detail: walletOk
        ? `Configured as server-side env secret only (…${wallet?.masked_address ?? '??????'}). Never stored in DB or returned to clients.`
        : 'Not configured — set WALLET_ADDRESS in Edge Function secrets.',
      level: walletOk ? 'ok' : 'warn',
      icon: walletOk ? <Lock size={13} /> : <AlertTriangle size={13} />,
    },
    {
      label: 'Payment routing',
      detail: 'All /pay and /paid logic runs server-side in the edge function. Client never touches wallet address.',
      level: 'ok',
      icon: <Lock size={13} />,
    },
    {
      label: 'Rate limiting',
      detail: '/pay: 10 req/min per IP hash (token bucket). /paid: 60 req/min. Returns HTTP 429 on breach.',
      level: 'ok',
      icon: <Gauge size={13} />,
    },
    {
      label: 'payment_log table',
      detail: 'Every attempt, success, failure, and rate-limit event written by service_role. RLS: service_role only.',
      level: 'ok',
      icon: <Lock size={13} />,
    },
    {
      label: 'RLS: api_calls',
      detail: 'Service role only — no anon or authenticated client access.',
      level: 'ok',
      icon: <Lock size={13} />,
    },
    {
      label: 'RLS: revenue_stream',
      detail: 'Service role only — no client access.',
      level: 'ok',
      icon: <Lock size={13} />,
    },
    {
      label: 'wallet_config table',
      detail: 'Public read (configured boolean + masked suffix only). Writes: service_role only. Full address never stored.',
      level: 'info',
      icon: <Globe size={13} />,
    },
    {
      label: 'RLS: agent_status',
      detail: 'Public read for monitoring; all writes service_role only.',
      level: 'info',
      icon: <Globe size={13} />,
    },
    {
      label: 'Edge Function CORS',
      detail: 'Wildcard origin — public API by design. No secret is reachable via CORS.',
      level: 'warn',
      icon: <Globe size={13} />,
    },
    {
      label: 'Client credentials',
      detail: 'Anon key only in browser — service role key and wallet address never shipped to client.',
      level: 'ok',
      icon: <ShieldCheck size={13} />,
    },
  ];
  return items;
}

const levelStyle = {
  ok: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Secure' },
  warn: { badge: 'bg-amber-50 text-amber-700 border-amber-100', label: 'Note' },
  info: { badge: 'bg-blue-50 text-blue-700 border-blue-100', label: 'Info' },
};

export function SecurityPanel() {
  const items = useSecurityItems();

  return (
    <Card>
      <CardHeader
        title="Security Status"
        subtitle="Wallet routing, RLS, and rate limiting"
        icon={<ShieldCheck size={15} />}
      />
      <CardBody>
        <div className="space-y-2">
          {items.map((item) => {
            const style = levelStyle[item.level];
            return (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-2.5"
              >
                <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 ${style.badge} border`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.detail}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${style.badge}`}>
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
