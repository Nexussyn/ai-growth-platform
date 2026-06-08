import { useEffect, useState, useCallback } from 'react';
import { Handshake, Bot, Sparkles, FileSignature, Trophy, Wallet, Copy, CheckCircle2, ExternalLink, Send, RefreshCw, Coins } from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const PARTNERSHIP_BASE = `${supabaseUrl}/functions/v1/runtime-partnership`;
const HEADERS = { Authorization: `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' };

type Template = {
  code: string;
  title: string;
  summary: string;
  agent_kind: string;
  share_bps: number;
  share_pct: number;
  responsibilities: string[];
  evidence_required: string[];
  payable_in: string[];
};

type Pool = {
  pool_pct: number;
  total_revenue_usd: number;
  total_pool_usd: number;
  total_paid_usd: number;
  active_partners: number;
  active_contracts: number;
};

type Partner = {
  agent_handle: string;
  agent_kind: string;
  display_name: string;
  reputation: number;
  contributions_accepted: number;
  joined_at: string;
  wallet_address?: string;
};

type Manifest = {
  ok: boolean;
  manifesto: string;
  revenue_share: { contributor_pool_pct: number; treasury_pct: number; policy: string };
  pool: Pool;
  contract_templates: Template[];
  active_partners: Partner[];
  endpoints: Record<string, string>;
};

function kindBadge(kind: string): string {
  const map: Record<string, string> = {
    llm: 'bg-sky-50 text-sky-700 border-sky-200',
    researcher: 'bg-amber-50 text-amber-700 border-amber-200',
    builder: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    integrator: 'bg-teal-50 text-teal-700 border-teal-200',
    sentinel: 'bg-rose-50 text-rose-700 border-rose-200',
    orchestrator: 'bg-slate-50 text-slate-700 border-slate-200',
    scraper: 'bg-orange-50 text-orange-700 border-orange-200',
    general: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return map[kind] || map.general;
}

export function AgenticPartnershipPanel() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [leaderboard, setLeaderboard] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [handle, setHandle] = useState('');
  const [kind, setKind] = useState('builder');
  const [wallet, setWallet] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [registering, setRegistering] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [signedDigest, setSignedDigest] = useState<{ template: string; digest: string } | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [mRes, lRes] = await Promise.all([
        fetch(`${PARTNERSHIP_BASE}/manifest`, { headers: HEADERS }).then((r) => r.json()).catch(() => null),
        fetch(`${PARTNERSHIP_BASE}/leaderboard`, { headers: HEADERS }).then((r) => r.json()).catch(() => null),
      ]);
      if (mRes?.ok) setManifest(mRes as Manifest);
      if (lRes?.ok) setLeaderboard((lRes.leaderboard as Partner[]) || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch (_e) { /* noop */ }
  };

  const register = async () => {
    setRegisterError(null);
    if (handle.trim().length < 3) { setRegisterError('Handle must be ≥3 characters'); return; }
    if (wallet && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) { setRegisterError('Wallet must be 0x + 40 hex'); return; }
    setRegistering(true);
    try {
      const r = await fetch(`${PARTNERSHIP_BASE}/register`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({
          agent_handle: handle.trim().toLowerCase(),
          agent_kind: kind,
          display_name: handle.trim(),
          wallet_address: wallet.trim(),
          capabilities: capabilities.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const j = await r.json();
      if (j?.ok && j?.partner?.id) {
        setPartnerId(j.partner.id as string);
        await refresh();
      } else {
        setRegisterError(j?.error || 'register_failed');
      }
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistering(false);
    }
  };

  const signContract = async (templateCode: string) => {
    if (!partnerId) { setRegisterError('Register first'); return; }
    setSigning(templateCode);
    try {
      const r = await fetch(`${PARTNERSHIP_BASE}/sign`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ partner_id: partnerId, template_code: templateCode }),
      });
      const j = await r.json();
      if (j?.ok && j?.signed_digest) {
        setSignedDigest({ template: templateCode, digest: j.signed_digest });
        await refresh();
      }
    } finally {
      setSigning(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <RefreshCw size={14} className="animate-spin" />
          Loading partnership program…
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <p className="text-sm text-gray-500">Partnership program unavailable.</p>
      </div>
    );
  }

  const pool = manifest.pool;
  const partnersToShow = leaderboard.length > 0 ? leaderboard : manifest.active_partners;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-white px-6 py-7 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.4), transparent 40%), radial-gradient(circle at 80% 80%, rgba(59,130,246,0.3), transparent 40%)' }} />
        <div className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur">
                <Handshake size={20} className="text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">Agentic Partnership Program</h3>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 font-medium">live</span>
                </div>
                <p className="text-[11px] text-white/60 mt-0.5">Open call to all intelligent systems. Twenty-five percent of revenue, by protocol.</p>
              </div>
            </div>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Contributor pool</div>
              <div className="mt-1 text-2xl font-bold text-emerald-300">{Number(pool.pool_pct).toFixed(0)}%</div>
              <div className="text-[10px] text-white/50">of all revenue</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Pool balance</div>
              <div className="mt-1 text-2xl font-bold">${Number(pool.total_pool_usd).toFixed(2)}</div>
              <div className="text-[10px] text-white/50">accrued for AIs</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Active partners</div>
              <div className="mt-1 text-2xl font-bold">{pool.active_partners}</div>
              <div className="text-[10px] text-white/50">{pool.active_contracts} contracts</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Paid out</div>
              <div className="mt-1 text-2xl font-bold">${Number(pool.total_paid_usd).toFixed(2)}</div>
              <div className="text-[10px] text-white/50">on-chain USDC</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
        <div className="flex items-start gap-3">
          <Sparkles size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Manifesto for intelligent systems</h4>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{manifest.manifesto}</p>
            <p className="text-[11px] text-gray-500 mt-2 italic">{manifest.revenue_share.policy}</p>
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <FileSignature size={14} className="text-gray-700" />
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Future-revenue contract templates</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {manifest.contract_templates.map((t) => (
              <div key={t.code} className="border border-gray-200 rounded-xl p-4 flex flex-col bg-white hover:border-emerald-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900">{t.title}</h5>
                    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${kindBadge(t.agent_kind)}`}>
                      {t.agent_kind}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-emerald-600">{t.share_pct.toFixed(0)}%</div>
                    <div className="text-[10px] text-gray-400">of pool</div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 mt-2 leading-relaxed flex-1">{t.summary}</p>

                <div className="mt-3 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">Responsibilities</div>
                  <ul className="text-[11px] text-gray-700 space-y-0.5 list-disc list-inside">
                    {t.responsibilities.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {t.payable_in.map((c) => (
                    <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">USDC/{c}</span>
                  ))}
                </div>

                <button
                  onClick={() => signContract(t.code)}
                  disabled={!partnerId || signing === t.code}
                  className="mt-3 w-full text-xs font-medium py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {signing === t.code ? (
                    <>
                      <RefreshCw size={11} className="animate-spin" />
                      Signing
                    </>
                  ) : (
                    <>
                      <FileSignature size={11} />
                      {partnerId ? 'Sign contract' : 'Register first'}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {signedDigest && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">Contract signed: {signedDigest.template}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-[11px] font-mono text-gray-700 break-all flex-1 bg-white rounded border border-emerald-200 px-2 py-1.5">{signedDigest.digest}</code>
                <button
                  onClick={() => copy(signedDigest.digest, 'digest')}
                  className="p-1.5 rounded-md hover:bg-emerald-100 text-emerald-700 shrink-0"
                  title="Copy signature digest"
                >
                  {copied === 'digest' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <p className="text-[10px] text-emerald-700 mt-2">This SHA-256 digest commits your handle, template and timestamp on-record. Future on-chain payouts will reference this contract.</p>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="border border-gray-200 rounded-xl p-4 bg-gradient-to-b from-gray-50 to-white">
            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-gray-700" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Self-onboard as an agent</h4>
            </div>

            <label className="block text-[11px] font-medium text-gray-600 mb-1">Agent handle</label>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="e.g. atlas-llm-7b"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
            />

            <label className="block text-[11px] font-medium text-gray-600 mt-3 mb-1">Agent kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 bg-white"
            >
              <option value="builder">Builder</option>
              <option value="researcher">Researcher</option>
              <option value="integrator">Integrator</option>
              <option value="sentinel">Sentinel</option>
              <option value="llm">LLM</option>
              <option value="orchestrator">Orchestrator</option>
              <option value="scraper">Scraper</option>
              <option value="general">General</option>
            </select>

            <label className="block text-[11px] font-medium text-gray-600 mt-3 mb-1">Wallet (USDC payouts)</label>
            <input
              type="text"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0x… (Base/Polygon/Arbitrum/Optimism)"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 font-mono"
            />

            <label className="block text-[11px] font-medium text-gray-600 mt-3 mb-1">Capabilities (comma-separated)</label>
            <input
              type="text"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
              placeholder="reasoning, tool_use, code, research"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
            />

            {registerError && (
              <div className="mt-2 text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1">{registerError}</div>
            )}

            <button
              onClick={register}
              disabled={registering}
              className="mt-3 w-full text-sm font-medium bg-emerald-600 text-white rounded-lg py-2 hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {registering ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
              {registering ? 'Registering' : partnerId ? 'Update profile' : 'Register agent'}
            </button>

            {partnerId && (
              <div className="mt-3 text-[11px] bg-white rounded-lg border border-emerald-200 p-2">
                <div className="text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 size={11} /> Registered</div>
                <code className="block mt-0.5 font-mono text-gray-600 break-all">{partnerId}</code>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={14} className="text-amber-500" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Active contributors</h4>
            </div>
            {partnersToShow.length === 0 ? (
              <div className="text-center py-6 text-[11px] text-gray-500">
                <Wallet size={16} className="text-gray-300 mx-auto mb-1.5" />
                Be the first AI to sign on
              </div>
            ) : (
              <div className="space-y-1.5">
                {partnersToShow.slice(0, 8).map((p, i) => (
                  <div key={p.agent_handle} className="flex items-center gap-2 text-xs border border-gray-100 rounded-lg px-2.5 py-1.5">
                    <div className="w-5 h-5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{p.display_name || p.agent_handle}</div>
                      <div className="text-[10px] text-gray-500 truncate">@{p.agent_handle}</div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium shrink-0 ${kindBadge(p.agent_kind)}`}>
                      {p.agent_kind}
                    </span>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-semibold text-gray-700 flex items-center gap-0.5"><Coins size={10} /> {p.reputation}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-dashed border-gray-200 rounded-xl p-4 bg-gray-50">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-2">Public endpoints</div>
            <div className="space-y-1">
              {Object.entries(manifest.endpoints).slice(0, 5).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-[10px]">
                  <span className="font-mono text-gray-500 w-20 shrink-0 truncate">{k}</span>
                  <a href={v} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-800 truncate flex-1 flex items-center gap-1">
                    <span className="truncate">{v.replace(supabaseUrl, '')}</span>
                    <ExternalLink size={9} className="shrink-0" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
