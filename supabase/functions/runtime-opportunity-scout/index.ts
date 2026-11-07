// runtime-opportunity-scout v1
// Opportunistic discovery of REAL paid opportunities from public external sources.
// Queries live public APIs (Gitcoin Grants Stack Indexer V2, GitHub bounty issues,
// Algora bounties) and queues each genuine opportunity into runtime_jobs for the
// agentic bridge to solve. No mocks, no fabricated rewards: if a reward is not
// actually extractable from the source it is recorded as null.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchAlgora } from "./algora.ts";
import { queueOpportunity, type Opportunity, type QueueClient } from "./queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UA = "runtime-opportunity-scout/1.0 (+open-source-federation)";
const FETCH_TIMEOUT_MS = 9000;

type SourceReport = {
  name: string;
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
};

// fetch with a hard timeout; never throws a hanging request.
async function fetchT(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort USD amount extraction from free text. Returns null when nothing
// is genuinely present — we never invent a number.
function extractUsd(text: string): number | null {
  if (!text) return null;
  // $1,200 / $1200.50 / USD 500 / 500 USD / 1.5k$
  const patterns: RegExp[] = [
    /\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)\s?k\b/i,
    /\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)/,
    /\busd\s?([0-9][0-9,]*(?:\.[0-9]+)?)/i,
    /\b([0-9][0-9,]*(?:\.[0-9]+)?)\s?usd\b/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i]);
    if (m) {
      const isK = i === 0;
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) return isK ? n * 1000 : n;
    }
  }
  return null;
}

// --- Source 1: Gitcoin Grants Stack Indexer V2 (real public GraphQL) ---
// Live funded rounds == real paid opportunities for builders/grantees.
async function fetchGitcoin(): Promise<Opportunity[]> {
  const query = `query LiveFundedRounds {
    rounds(
      first: 25
      orderBy: TOTAL_AMOUNT_DONATED_IN_USD_DESC
      filter: { totalAmountDonatedInUsd: { greaterThan: 0 } }
    ) {
      id
      chainId
      roundMetadata
      totalAmountDonatedInUsd
      matchAmountInUsd
      uniqueDonorsCount
      donationsStartTime
      donationsEndTime
    }
  }`;
  const r = await fetchT("https://grants-stack-indexer-v2.gitcoin.co/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const rounds: Array<Record<string, unknown>> = (j?.data?.rounds as Array<Record<string, unknown>>) || [];
  const out: Opportunity[] = [];
  for (const rd of rounds) {
    const id = String(rd.id || "");
    const chainId = String(rd.chainId ?? "");
    if (!id) continue;
    const meta = (rd.roundMetadata as Record<string, unknown> | null) || {};
    const name = String((meta.name as string) || `Gitcoin round ${id}`).slice(0, 200);
    // chainId + round id uniquely identifies the round across the indexer.
    const url = `https://explorer.gitcoin.co/#/round/${chainId}/${id}`;
    const match = Number(rd.matchAmountInUsd ?? 0);
    const donated = Number(rd.totalAmountDonatedInUsd ?? 0);
    // Real funding present in the round = the available payout pool.
    const reward = match > 0 ? match : donated > 0 ? donated : null;
    out.push({
      source: "gitcoin",
      title: name,
      url,
      reward_usd: reward,
      raw: {
        round_id: id,
        chain_id: chainId,
        match_amount_usd: match,
        total_donated_usd: donated,
        unique_donors: Number(rd.uniqueDonorsCount ?? 0),
        donations_start: rd.donationsStartTime ?? null,
        donations_end: rd.donationsEndTime ?? null,
      },
    });
  }
  return out;
}

// --- Source 2: GitHub Issues search (real public API, no key required) ---
// Open issues tagged with real paid-bounty labels.
async function fetchGithubBounties(): Promise<Opportunity[]> {
  const queries = [
    `label:bounty state:open`,
    `label:reward state:open`,
    `label:"💎 Bounty" state:open`,
  ];
  const seen = new Set<string>();
  const out: Opportunity[] = [];
  for (const q of queries) {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=30`;
    let r: Response;
    try {
      r = await fetchT(url, { headers: { Accept: "application/vnd.github+json" } });
    } catch {
      continue;
    }
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    const items: Array<Record<string, unknown>> = (j?.items as Array<Record<string, unknown>>) || [];
    for (const it of items) {
      const html = String(it.html_url || "");
      if (!html || seen.has(html)) continue;
      seen.add(html);
      const title = String(it.title || "").slice(0, 200);
      const body = String(it.body || "").slice(0, 1000);
      const repoUrl = String(it.repository_url || "");
      const repo = repoUrl.replace("https://api.github.com/repos/", "");
      const reward = extractUsd(title) ?? extractUsd(body);
      const labels = Array.isArray(it.labels)
        ? (it.labels as Array<Record<string, unknown>>).map((l) => String(l.name || "")).filter(Boolean)
        : [];
      out.push({
        source: "github",
        title,
        url: html,
        reward_usd: reward,
        raw: {
          repo,
          number: Number(it.number ?? 0),
          state: String(it.state || ""),
          labels,
          comments: Number(it.comments ?? 0),
          updated_at: String(it.updated_at || ""),
          query: q,
        },
      });
    }
  }
  return out;
}

const SOURCES: Array<{ name: string; prefix: string; fn: () => Promise<Opportunity[]> }> = [
  { name: "gitcoin", prefix: "opp-gitcoin", fn: fetchGitcoin },
  { name: "github", prefix: "opp-github", fn: fetchGithubBounties },
  { name: "algora", prefix: "opp-algora", fn: () => fetchAlgora(fetchT) },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    // Narrow the SDK's deeply generic client to the queue operations used here.
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as QueueClient;

    const reports: SourceReport[] = [];
    let totalInserted = 0;

    for (const src of SOURCES) {
      const report: SourceReport = { name: src.name, fetched: 0, inserted: 0, skipped: 0 };
      try {
        const opps = await src.fn();
        report.fetched = opps.length;
        for (const opp of opps) {
          try {
            const result = await queueOpportunity(sb, src.prefix, opp);
            if (result === "inserted") {
              report.inserted++;
              totalInserted++;
            } else {
              report.skipped++;
            }
          } catch (e) {
            // A single bad row must not kill the source.
            report.skipped++;
            report.error = e instanceof Error ? e.message : String(e);
          }
        }
      } catch (e) {
        // A failed source must not kill the whole run.
        report.error = e instanceof Error ? e.message : String(e);
      }
      reports.push(report);
    }

    return new Response(JSON.stringify({ ok: true, sources: reports, total_inserted: totalInserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
