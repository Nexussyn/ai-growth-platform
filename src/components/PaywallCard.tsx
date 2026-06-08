import { useState, useCallback } from 'react';
import { Zap, Lock, CheckCircle, ChevronRight, AlertTriangle, Loader2, ShieldCheck, Wallet, ExternalLink } from 'lucide-react';
import { useLoopStatus, useWalletConfig } from '../lib/hooks';
import { EDGE_BASE, edgeFetch } from '../lib/supabase';
import { Skeleton } from './Skeleton';
import type { PaymentState, EIP1193Provider } from '../lib/types';
import { custom, createWalletClient } from 'viem';
import { base } from 'viem/chains';

const FEATURES = [
  'Unlimited paid API calls at 0.03 USDC each',
  'Real on-chain USDC settlement via x402 protocol on Base',
  'All AI agents: marketing, growth, finance, security, devops',
  'Machine-readable x402 discovery manifest',
  'Orchestrator picks the highest-RPV variant automatically',
  'Every payment logged server-side with on-chain tx hash',
];

const STATE_LABELS: Partial<Record<PaymentState, string>> = {
  connecting_wallet: 'Connecting wallet...',
  submitting: 'Waiting for wallet signature...',
  success: 'Payment confirmed on-chain. Access granted.',
  error: 'Payment failed. Check your wallet and try again.',
  no_wallet: 'No wallet detected.',
  wallet_missing: 'Server wallet not configured. Contact the operator.',
};

async function getProvider(): Promise<EIP1193Provider | null> {
  if (typeof window === 'undefined') return null;
  if (window.ethereum) return window.ethereum;
  return null;
}

async function signX402Payment(
  provider: EIP1193Provider,
  address: `0x${string}`,
  paymentRequiredHeader: string
): Promise<string> {
  const payload = JSON.parse(atob(paymentRequiredHeader));
  const walletClient = createWalletClient({
    account: address,
    chain: base,
    transport: custom(provider),
  });

  const signature = await walletClient.signTypedData({
    account: address,
    domain: {
      name: payload.domain?.name ?? 'x402',
      version: payload.domain?.version ?? '1',
      chainId: payload.domain?.chainId ?? 8453,
      verifyingContract: payload.domain?.verifyingContract ?? payload.asset as `0x${string}`,
    },
    types: payload.types ?? {
      Payment: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: payload.primaryType ?? 'Payment',
    message: payload.message ?? {
      to: payload.recipient,
      value: BigInt(payload.maxAmountRequired ?? '30000'),
      validAfter: BigInt(0),
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
      nonce: `0x${crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')}` as `0x${string}`,
    },
  });

  const paymentResponse = btoa(JSON.stringify({
    signature,
    address,
    chainId: 8453,
    ...payload.message,
  }));

  return paymentResponse;
}

export function PaywallCard() {
  const { data: loop, loading: loopLoading } = useLoopStatus();
  const { data: walletCfg } = useWalletConfig();
  const [payState, setPayState] = useState<PaymentState>('idle');
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const variant = loop?.best_variant;
  const walletConfigured = walletCfg?.configured ?? true;

  const handleConnect = useCallback(async () => {
    const provider = await getProvider();
    if (!provider) { setPayState('no_wallet'); return; }
    setPayState('connecting_wallet');
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts.length === 0) { setPayState('idle'); return; }
      setConnectedAddress(accounts[0]);
      setPayState('wallet_connected');
      edgeFetch('/wallet/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: 'injected', wallet_address: accounts[0], event_type: 'connected', chain_id: 'base-mainnet', session_id: crypto.randomUUID() }),
      }).catch(() => null);
    } catch {
      setPayState('idle');
    }
  }, []);

  const handlePay = useCallback(async () => {
    if (payState === 'submitting') return;

    const provider = await getProvider();
    if (!provider) { setPayState('no_wallet'); return; }

    let address = connectedAddress;
    if (!address) {
      setPayState('connecting_wallet');
      try {
        const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
        if (accounts.length === 0) { setPayState('idle'); return; }
        address = accounts[0];
        setConnectedAddress(address);
      } catch {
        setPayState('idle');
        return;
      }
    }

    setPayState('submitting');
    try {
      const intentRes = await edgeFetch('/payment/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, provider_id: 'injected', session_id: crypto.randomUUID() }),
      });
      if (intentRes.status === 503) { setPayState('wallet_missing'); return; }
      if (!intentRes.ok) { setPayState('error'); return; }
      const intent = await intentRes.json();

      // First call /pay without payment header to get the 402 response
      const initialRes = await fetch(`${EDGE_BASE}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (initialRes.status !== 402) {
        if (initialRes.status === 503) { setPayState('wallet_missing'); return; }
        if (!initialRes.ok) { setPayState('error'); return; }
      }

      // Extract PAYMENT-REQUIRED header
      const paymentRequiredHeader = initialRes.headers.get('PAYMENT-REQUIRED') ?? initialRes.headers.get('payment-required');
      if (!paymentRequiredHeader) { setPayState('error'); return; }

      // Sign the payment with wallet
      const paymentHeader = await signX402Payment(
        provider,
        address as `0x${string}`,
        paymentRequiredHeader
      );

      // Resend with payment proof
      const res = await fetch(`${EDGE_BASE}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT': paymentHeader,
        },
      });

      if (res.status === 503) { setPayState('wallet_missing'); return; }
      if (res.status === 429) { setPayState('error'); return; }
      if (!res.ok) { setPayState('error'); return; }

      let hash: string | null = null;
      const paymentResponseHeader = res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('payment-response');
      if (paymentResponseHeader) {
        try {
          const decoded = JSON.parse(atob(paymentResponseHeader));
          hash = decoded.transaction ?? decoded.txHash ?? null;
        } catch { /* no hash available */ }
      }
      if (!hash) {
        const body = await res.json().catch(() => ({}));
        hash = body?.tx_hash ?? null;
      }
      setTxHash(hash);

      edgeFetch('/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: intent.idempotency_key, tx_hash: hash, wallet_address: address }),
      }).catch(() => null);

      setPayState('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User denied')) {
        setPayState('wallet_connected');
      } else {
        setPayState('error');
      }
    }
  }, [payState, connectedAddress]);

  const handleCopyEndpoint = () => {
    const info = JSON.stringify({
      protocol: 'x402',
      endpoint: `POST ${EDGE_BASE}/pay`,
      network: 'Base mainnet (eip155:8453)',
      asset: 'USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)',
      price: '0.03 USDC',
      client: 'viem + EIP-712 signing',
    }, null, 2);
    navigator.clipboard.writeText(info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const stateMsg = STATE_LABELS[payState] ?? null;
  const isSubmitting = payState === 'submitting' || payState === 'connecting_wallet';
  const isSuccess = payState === 'success';
  const isConnected = !!connectedAddress && payState !== 'success';

  return (
    <div id="paywall" className="rounded-2xl border-2 border-gray-900 bg-white overflow-hidden">
      <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock size={15} className="text-white/60" />
          <span className="text-sm font-semibold text-white">Paid Access - 0.03 USDC - Base</span>
        </div>
        <div className="flex items-center gap-2">
          {walletConfigured ? (
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <ShieldCheck size={10} /> Wallet configured
            </span>
          ) : (
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <AlertTriangle size={10} /> Wallet missing
            </span>
          )}
          <span className="text-xs bg-white/10 text-white/60 border border-white/10 px-2 py-0.5 rounded-full font-medium">
            x402
          </span>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div>
          {loopLoading ? (
            <><Skeleton className="h-6 w-64 mb-2" /><Skeleton className="h-4 w-48" /></>
          ) : (
            <>
              <h2 className="text-lg font-bold text-gray-900">
                {variant?.title ?? 'Unlock the full agent system'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {variant?.description ?? 'Pay 0.03 USDC per call. No subscriptions. Real on-chain settlement.'}
              </p>
            </>
          )}
        </div>

        {connectedAddress && (
          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <Wallet size={12} className="shrink-0" />
            <span className="font-mono truncate">
              {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
            </span>
            <span className="text-blue-400">- Base</span>
          </div>
        )}

        {stateMsg && (
          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 border ${
            isSuccess
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : payState === 'wallet_missing' || payState === 'no_wallet'
              ? 'bg-amber-50 border-amber-100 text-amber-700'
              : 'bg-red-50 border-red-100 text-red-700'
          }`}>
            {isSuccess
              ? <CheckCircle size={13} className="shrink-0 mt-0.5" />
              : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
            <span>{stateMsg}</span>
            {isSuccess && txHash && (
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 ml-1 text-emerald-600 hover:text-emerald-800 underline"
              >
                View on Basescan <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}

        {payState === 'no_wallet' && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-amber-800">No wallet detected</p>
            <p className="text-xs text-amber-700">Install a Web3 wallet to pay with USDC on Base:</p>
            <div className="flex gap-3">
              <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:text-blue-800 underline">Coinbase Wallet</a>
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:text-blue-800 underline">MetaMask</a>
            </div>
          </div>
        )}

        <ul className="space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
              <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
              {f}
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
          <ShieldCheck size={13} className="text-gray-400 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            Payment routing is <strong>entirely server-side</strong>. The x402 facilitator settles 0.03 USDC
            directly on-chain to the operator wallet. Your wallet address is never stored.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          {!isSuccess && !connectedAddress && (
            <button
              onClick={handleConnect}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 border-2 border-gray-900 text-gray-900 text-sm font-semibold px-5 py-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
            >
              {payState === 'connecting_wallet'
                ? <><Loader2 size={15} className="animate-spin" /> Connecting...</>
                : <><Wallet size={15} /> Connect wallet</>}
            </button>
          )}

          <button
            onClick={handlePay}
            disabled={isSubmitting || isSuccess || !walletConfigured}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-xl hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {isSubmitting ? (
              <><Loader2 size={15} className="animate-spin" /> {payState === 'connecting_wallet' ? 'Connecting...' : 'Awaiting signature...'}</>
            ) : isSuccess ? (
              <><CheckCircle size={15} /> Access granted</>
            ) : isConnected ? (
              <><Zap size={15} /> Pay 0.03 USDC</>
            ) : (
              <><Zap size={15} /> Connect & Pay 0.03 USDC</>
            )}
          </button>

          <button
            onClick={handleCopyEndpoint}
            className="flex items-center justify-center gap-2 border border-gray-200 text-gray-600 text-sm font-medium px-4 py-3 rounded-xl hover:bg-gray-50 transition-all"
            title="Copy API endpoint info"
          >
            {copied ? <CheckCircle size={14} className="text-emerald-500" /> : <ChevronRight size={14} />}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Uses the x402 protocol on Base mainnet. Your wallet signs an EIP-712 authorization -
          no private key is ever shared. Requires Coinbase Wallet or MetaMask with USDC on Base.
        </p>
      </div>
    </div>
  );
}
