import { useEffect, useState, useCallback } from 'react';
import { Wallet, Copy, ExternalLink, RefreshCw, CheckCircle2, Clock, ArrowDownToLine, Network, ShieldCheck, ShoppingBag, Globe2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const PAYMENTS_BASE = `${supabaseUrl}/functions/v1/runtime-payments`;
const WATCHER_BASE = `${supabaseUrl}/functions/v1/runtime-onchain-watcher`;
const HEADERS = { Authorization: `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' };

type AddressInfo = {
  address: string;
  masked: string;
  network: string;
  chain_id: number;
  currency: string;
  token_contract: string;
  token_decimals: number;
  locked_at: string | null;
};

type Receipt = {
  network: string;
  tx_hash: string;
  amount_usd: number;
  from_address: string;
  destination: string;
  block_number: number;
  confirmed_at: string;
};

type WatchState = {
  id: string;
  last_scanned_block: number;
  last_scan_at: string | null;
  watch_address: string;
};

type RpcEndpoint = {
  url: string;
  ok_count: number;
  fail_count: number;
  last_ok_at: string | null;
  last_fail_at: string | null;
};

type ChainRow = {
  id: string;
  network: string;
  chain_id: number;
  token_symbol: string;
  token_contract: string;
  token_decimals: number;
  watch_address: string;
  active: boolean;
  last_scanned_block: number;
  last_scan_at: string | null;
  explorer_url: string;
};

type Product = {
  slug: string;
  title: string;
  description: string;
  price_usdc: number;
  deliverable_kind: string;
  accepted_chains: string[];
  display_order: number;
};

type PayOption = {
  network: string;
  chain_id: number;
  token: string;
  token_contract: string;
  eip681: string;
  explorer: string;
};

function shortAddr(a: string) {
  if (!a) return '';
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function shortHash(h: string) {
  if (!h) return '';
  return h.length > 16 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

function formatTimeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DecentralizedPaymentsPanel() {
  const [info, setInfo] = useState<AddressInfo | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [watch, setWatch] = useState<WatchState | null>(null);
  const [rpcs, setRpcs] = useState<RpcEndpoint[]>([]);
  const [chains, setChains] = useState<ChainRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalUsd, setTotalUsd] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [matchedCount, setMatchedCount] = useState<number>(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const [amount, setAmount] = useState<string>('5');
  const [description, setDescription] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [intent, setIntent] = useState<{ reference: string; eip681: string; address: string; amount_usdc: number; status_url: string; pay_options: PayOption[] } | null>(null);

  const refresh = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];

    tasks.push(
      fetch(`${PAYMENTS_BASE}/address`, { headers: HEADERS })
        .then((r) => r.json())
        .then((j) => { if (j?.ok) setInfo(j as AddressInfo); })
        .catch(() => {}),
    );

    tasks.push(
      fetch(`${PAYMENTS_BASE}/recent?limit=15`, { headers: HEADERS })
        .then((r) => r.json())
        .then((j) => { if (j?.ok) setReceipts(j.payments as Receipt[]); })
        .catch(() => {}),
    );

    tasks.push(
      fetch(`${PAYMENTS_BASE}/products`, { headers: HEADERS })
        .then((r) => r.json())
        .then((j) => { if (j?.ok && Array.isArray(j.products)) setProducts(j.products as Product[]); })
        .catch(() => {}),
    );

    tasks.push(
      supabase.from('payment_chains').select('id,network,chain_id,token_symbol,token_contract,token_decimals,watch_address,active,last_scanned_block,last_scan_at,explorer_url').eq('active', true).order('chain_id', { ascending: true })
        .then(({ data }) => { if (data) setChains(data as ChainRow[]); }),
    );

    tasks.push(
      supabase.from('chain_watch_state').select('id,last_scanned_block,last_scan_at,watch_address').eq('id', 'base-usdc').maybeSingle()
        .then(({ data }) => { if (data) setWatch(data as WatchState); }),
    );

    tasks.push(
      supabase.from('chain_rpc_endpoints').select('url,ok_count,fail_count,last_ok_at,last_fail_at').eq('network', 'Base').order('fail_count', { ascending: true })
        .then(({ data }) => { if (data) setRpcs(data as RpcEndpoint[]); }),
    );

    tasks.push(
      supabase.from('onchain_payments').select('amount_usd')
        .then(({ data }) => {
          if (Array.isArray(data)) {
            const sum = data.reduce((acc, r) => acc + Number((r as { amount_usd: number }).amount_usd || 0), 0);
            setTotalUsd(sum);
          }
        }),
    );

    tasks.push(
      supabase.from('payment_intents').select('status', { count: 'exact' }).eq('status', 'pending')
        .then(({ count }) => { setPendingCount(count ?? 0); }),
    );

    tasks.push(
      supabase.from('payment_intents').select('status', { count: 'exact' }).eq('status', 'matched')
        .then(({ count }) => { setMatchedCount(count ?? 0); }),
    );

    await Promise.all(tasks);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
  }, [refresh]);

  const triggerScan = async () => {
    setScanning(true);
    try {
      await fetch(WATCHER_BASE, { method: 'POST', headers: HEADERS, body: '{}' });
      await refresh();
    } finally {
      setScanning(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch (_e) { /* noop */ }
  };

  const createIntent = async () => {
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) return;
    setCreating(true);
    try {
      const r = await fetch(`${PAYMENTS_BASE}/create`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ amount_usdc: n, description }),
      });
      const j = await r.json();
      if (j?.ok) {
        const opts: PayOption[] = Array.isArray(j.pay_options) ? j.pay_options : [];
        const base = opts.find((o) => o.network === 'Base') || opts[0];
        setIntent({
          reference: j.intent.reference,
          eip681: base?.eip681 || '',
          address: j.receiving_address || j.intent.destination || '',
          amount_usdc: Number(j.intent.amount_usdc),
          status_url: j.status_url,
          pay_options: opts,
        });
        await refresh();
      }
    } finally {
      setCreating(false);
    }
  };

  const buyProduct = async (slug: string, network?: string) => {
    setBuying(slug);
    try {
      const r = await fetch(`${PAYMENTS_BASE}/pay/${slug}`, { headers: HEADERS });
      const j = await r.json();
      if (j?.ok) {
        const opts: PayOption[] = Array.isArray(j.pay_options) ? j.pay_options : [];
        const chosen = network ? opts.find((o) => o.network === network) : (opts.find((o) => o.network === 'Base') || opts[0]);
        if (chosen?.eip681) {
          window.open(chosen.eip681, '_blank');
        }
        setIntent({
          reference: j.intent.reference,
          eip681: chosen?.eip681 || '',
          address: j.receiving_address || j.intent.destination || '',
          amount_usdc: Number(j.intent.amount_usdc),
          status_url: j.status_url,
          pay_options: opts,
        });
        await refresh();
      }
    } finally {
      setBuying(null);
    }
  };

  const fullAddress = info?.address || watch?.watch_address || '';
  const masked = info?.masked || '';
  const explorerUrl = fullAddress ? `https://basescan.org/token/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913?a=${fullAddress}` : '';
  const healthyRpcs = rpcs.filter((r) => (r.ok_count || 0) > 0 || ((r.fail_count || 0) === 0)).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <Wallet size={18} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Decentralized USDC payments</h3>
            <p className="text-xs text-gray-500">No keys. No middleman. On-chain settlement on Base &middot; <span className="text-emerald-600 font-medium">{healthyRpcs} of {rpcs.length} public RPC online</span></p>
          </div>
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning chain…' : 'Scan now'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <div className="bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Confirmed receipts</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{receipts.length === 0 ? 0 : Math.max(receipts.length, matchedCount)}</div>
          <div className="text-[11px] text-gray-500">on-chain transfers</div>
        </div>
        <div className="bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Total USDC received</div>
          <div className="mt-1 text-xl font-semibold text-emerald-600">${totalUsd.toFixed(2)}</div>
          <div className="text-[11px] text-gray-500">{info?.currency || 'USDC'} / {info?.network || 'Base'}</div>
        </div>
        <div className="bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Pending intents</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{pendingCount}</div>
          <div className="text-[11px] text-gray-500">awaiting payer</div>
        </div>
        <div className="bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Last chain scan</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{formatTimeAgo(watch?.last_scan_at)}</div>
          <div className="text-[11px] text-gray-500">block #{watch?.last_scanned_block?.toLocaleString() || 0}</div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-gray-50 rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span className="text-xs font-semibold text-gray-700">Sealed receiving address</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">immutable</span>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 flex items-center justify-between gap-3">
            <code className="text-[11px] sm:text-xs font-mono text-gray-900 break-all">{fullAddress || '—'}</code>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => copy(fullAddress, 'address')}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
                title="Copy address"
              >
                {copied === 'address' ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
                title="View on BaseScan"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Network</div>
              <div className="text-xs font-medium text-gray-900 mt-0.5 flex items-center gap-1"><Network size={11} /> Base</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Chain ID</div>
              <div className="text-xs font-medium text-gray-900 mt-0.5">8453</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Token</div>
              <div className="text-xs font-medium text-gray-900 mt-0.5">USDC</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Sealed</div>
              <div className="text-xs font-medium text-gray-900 mt-0.5">{info?.locked_at ? formatTimeAgo(info.locked_at) : '—'}</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Public RPC pool (no key, decentralized)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {rpcs.map((r) => {
                const okRecent = r.last_ok_at && new Date(r.last_ok_at).getTime() > Date.now() - 600000;
                const failed = r.fail_count > 0 && (!r.last_ok_at || (r.last_fail_at && new Date(r.last_fail_at).getTime() > new Date(r.last_ok_at).getTime()));
                return (
                  <div key={r.url} className="flex items-center justify-between text-[11px] bg-white border border-gray-200 rounded-md px-2 py-1.5">
                    <code className="font-mono text-gray-700 truncate" title={r.url}>{r.url.replace(/^https?:\/\//, '')}</code>
                    <span className={`shrink-0 ml-2 inline-flex items-center gap-1 ${okRecent ? 'text-emerald-600' : failed ? 'text-amber-600' : 'text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${okRecent ? 'bg-emerald-500' : failed ? 'bg-amber-500' : 'bg-gray-300'}`} />
                      {okRecent ? 'live' : failed ? 'retry' : 'standby'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownToLine size={14} className="text-gray-700" />
            <span className="text-xs font-semibold text-gray-700">Create payment request</span>
          </div>

          <label className="block text-[11px] font-medium text-gray-600 mb-1">Amount (USDC)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
          />

          <label className="block text-[11px] font-medium text-gray-600 mt-3 mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this payment for?"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
          />

          <button
            onClick={createIntent}
            disabled={creating || !fullAddress}
            className="mt-4 w-full text-sm font-medium bg-gray-900 text-white rounded-lg py-2 hover:bg-gray-700 disabled:opacity-40"
          >
            {creating ? 'Creating…' : 'Generate payable link'}
          </button>

          {intent && (
            <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-semibold text-emerald-700">Reference {intent.reference}</div>
              <div className="text-xs text-gray-700">
                Send <span className="font-semibold">{intent.amount_usdc} USDC</span> to{' '}
                <code className="font-mono break-all">{intent.address}</code>
              </div>
              {intent.pay_options.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {intent.pay_options.map((o) => (
                    <a
                      key={o.network}
                      href={o.eip681}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium px-2 py-1 bg-white border border-emerald-200 rounded text-emerald-700 hover:bg-emerald-100"
                    >
                      Pay on {o.network}
                    </a>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copy(intent.eip681, 'eip681')}
                  className="text-[11px] flex items-center gap-1 px-2 py-1 bg-white border border-emerald-200 rounded text-emerald-700 hover:bg-emerald-50"
                >
                  {copied === 'eip681' ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                  Copy EIP-681
                </button>
                <a
                  href={intent.status_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] flex items-center gap-1 px-2 py-1 bg-white border border-emerald-200 rounded text-emerald-700 hover:bg-emerald-50"
                >
                  <ExternalLink size={11} />
                  Status
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag size={14} className="text-gray-700" />
            <h4 className="text-xs font-semibold text-gray-700">Payable catalog</h4>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">live</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Globe2 size={11} />
            {chains.length} chain{chains.length === 1 ? '' : 's'} accepting USDC
          </div>
        </div>
        {products.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-6 text-center">
            <ShoppingBag size={16} className="text-gray-400 mx-auto mb-1.5" />
            <p className="text-xs text-gray-500">Catalog loading…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {products.map((p) => {
              const usable = chains.filter((c) => p.accepted_chains.includes(c.network));
              return (
                <div key={p.slug} className="border border-gray-200 rounded-xl p-4 flex flex-col bg-white hover:border-emerald-300 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="text-sm font-semibold text-gray-900">{p.title}</h5>
                    <span className="text-sm font-bold text-emerald-600 shrink-0">${p.price_usdc.toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed flex-1">{p.description}</p>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-3 mb-1.5">Pay with USDC on</div>
                  <div className="flex flex-wrap gap-1.5">
                    {usable.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => buyProduct(p.slug, c.network)}
                        disabled={buying === p.slug}
                        className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        <Network size={10} />
                        {c.network}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-700">Recent on-chain receipts</h4>
          <span className="text-[11px] text-gray-400">streaming from public RPC</span>
        </div>
        {receipts.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-6 text-center">
            <Clock size={16} className="text-gray-400 mx-auto mb-1.5" />
            <p className="text-xs text-gray-500">Awaiting first inbound USDC transfer. Watcher polls {chains.length || 1} chain{chains.length === 1 ? '' : 's'} every minute.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {receipts.map((r) => {
              const chain = chains.find((c) => c.network === r.network);
              const explorer = chain ? `${chain.explorer_url}/tx/${r.tx_hash}` : `https://basescan.org/tx/${r.tx_hash}`;
              return (
                <div key={`${r.tx_hash}-${r.block_number}`} className="flex items-center justify-between text-xs border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium shrink-0">{r.network || 'Base'}</span>
                    <code className="font-mono text-gray-700 truncate">{shortHash(r.tx_hash)}</code>
                    <span className="text-gray-400 hidden sm:inline">from {shortAddr(r.from_address)}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-emerald-600">+${Number(r.amount_usd).toFixed(2)}</span>
                    <span className="text-gray-400">{formatTimeAgo(r.confirmed_at)}</span>
                    <a
                      href={explorer}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-400 hover:text-gray-700"
                      title="View transaction"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
