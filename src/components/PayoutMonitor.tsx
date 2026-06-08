import { Wallet, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { useWalletStatus, useWalletConfig } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { Skeleton } from './Skeleton';

export function PayoutMonitor() {
  const { data: walletStatus, loading: wsLoading, error: wsError } = useWalletStatus();
  const { data: walletCfg } = useWalletConfig();

  const walletConfigured = walletCfg?.configured ?? walletStatus?.configured ?? false;
  const maskedAddr = walletCfg?.masked_address || walletStatus?.masked_address || '';
  const lastUpdated = walletCfg?.updated_at;

  return (
    <Card>
      <CardHeader
        title="Payout Monitor"
        subtitle="Settlement routing status"
        icon={<Wallet size={15} />}
        action={
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
            walletConfigured
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          }`}>
            {walletConfigured ? 'Wallet active' : 'Wallet missing'}
          </span>
        }
      />
      <CardBody className="space-y-4">

        {/* Wallet destination row */}
        <div className={`rounded-xl border px-4 py-3 ${walletConfigured ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {walletConfigured
                ? <CheckCircle size={13} className="text-emerald-600" />
                : <AlertTriangle size={13} className="text-amber-600" />}
              <span className="text-xs font-semibold text-gray-800">Destination wallet</span>
            </div>
            <span className="text-xs font-mono text-gray-500">
              {maskedAddr ? `...${maskedAddr}` : 'Not set'}
            </span>
          </div>
          {wsLoading ? (
            <Skeleton className="h-3 w-48 bg-gray-200" />
          ) : (
            <p className="text-xs text-gray-500">
              {wsError
                ? 'Status unavailable — edge function unreachable'
                : walletStatus?.setup_instruction ?? (walletConfigured
                  ? 'Payments route to the configured Base wallet via edge function. Settlement is server-side only.'
                  : 'Set WALLET_ADDRESS in Supabase Edge Function secrets to enable payouts.')}
            </p>
          )}
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">Config synced {new Date(lastUpdated).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-center">
            <CheckCircle size={14} className="mx-auto text-emerald-500 mb-1" />
            <p className="text-xs font-medium text-emerald-800">Immutable routing</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-center">
            <Clock size={14} className="mx-auto text-gray-400 mb-1" />
            <p className="text-xs font-medium text-gray-700">Server-side only</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-center">
            <Wallet size={14} className="mx-auto text-gray-400 mb-1" />
            <p className="text-xs font-medium text-gray-700">Ledger reconciled</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
          All settlement amounts are processed and reconciled server-side.
          Financial totals are not exposed publicly.
          Wallet address is a server-side secret — only masked suffix shown here.
        </p>
      </CardBody>
    </Card>
  );
}
