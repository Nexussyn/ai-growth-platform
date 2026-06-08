import { AlertTriangle, Terminal, ExternalLink } from 'lucide-react';
import { useWalletConfig } from '../lib/hooks';
import { Skeleton } from './Skeleton';

export function WalletConfigBanner() {
  const { data, loading, error } = useWalletConfig();

  // Don't render anything while loading or if wallet is correctly configured
  if (loading) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-5 py-4 flex items-center gap-3">
        <Skeleton className="h-5 w-5 rounded bg-amber-100" />
        <Skeleton className="h-4 w-64 bg-amber-100" />
      </div>
    );
  }

  // If we can't read wallet_config, show a neutral info banner
  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-gray-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-500">
          Unable to verify wallet configuration status. Payment routing may be unavailable.
        </p>
      </div>
    );
  }

  // Wallet is configured — render nothing, let the normal UI show
  if (data?.configured) return null;

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
      <div className="bg-amber-400 px-5 py-2.5 flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-900" />
        <span className="text-sm font-semibold text-amber-900">
          Wallet not configured — payments disabled
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-amber-800">
          No destination wallet is set. All <code className="bg-amber-100 px-1 rounded text-xs">/pay</code> and{' '}
          <code className="bg-amber-100 px-1 rounded text-xs">/paid</code> requests will return{' '}
          <code className="bg-amber-100 px-1 rounded text-xs">503 WALLET_NOT_CONFIGURED</code> until this is resolved.
        </p>

        <div className="bg-white border border-amber-200 rounded-lg px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
            Setup instructions
          </p>
          <ol className="space-y-1.5 text-sm text-amber-800 list-decimal list-inside">
            <li>Open your Supabase project dashboard</li>
            <li>Navigate to <strong>Edge Functions</strong> &rarr; <strong>multi-ai-system</strong></li>
            <li>Click <strong>Secrets</strong> and add:</li>
          </ol>
          <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2 mt-2">
            <Terminal size={12} className="text-gray-400 shrink-0" />
            <code className="text-xs text-emerald-400 font-mono">
              WALLET_ADDRESS=0xYourBaseWalletAddress
            </code>
          </div>
          <p className="text-xs text-amber-700">
            The full address is stored only as an env secret — never in the database or client.
          </p>
        </div>

        <a
          href="https://supabase.com/dashboard/project/_/functions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
        >
          Open Supabase Edge Functions
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}
