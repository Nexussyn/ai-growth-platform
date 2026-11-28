// runtime-opportunity-scout v1
// Opportunistic discovery of REAL paid opportunities from public external sources.
// Queries live public APIs (Gitcoin Grants Stack Indexer V2, GitHub bounty issues,
// Algora bounties) and queues each genuine opportunity into runtime_jobs for the
// agentic bridge to solve. No mocks, no fabricated rewards: if a reward is not
// actually extractable from the source it is recorded as null.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractUsd,
  isAlgoraEmptyState,
  parseAlgoraBounties,
  stableTaskId,
  type Opportunity,
  type SourceFetch,
} from "./parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UA = "runtime-opportunity-scout/1.0 (+open-source-federation)";
const FETCH_TIMEOUT_MS = 9000;

// Normalized real opportunity shape is defined in ./parse.ts alongside the
// parsers that produce it.

type SourceReport = {
  name: string;
  fetched: number;
  inserted: number;
  skipped: number;
  note?: string;
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

// priority scales with reward; unknown reward gets a small baseline.
function rewardPriority(reward: number | null): number {
  if (reward == null) return 3;
  if (reward >= 5000) return 90;
  if (reward >= 1000) return 70;
  if (reward >= 250) return 50;
  if (reward >= 50) return 30;
  return 15;
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

// --- Source 3: Algora public bounties (best-effort, no key) ---
// The documented endpoint is an HTML page, not a JSON API: requesting it with
// `Accept: application/json` returns 406, and the body is a server-rendered
// page. We therefore inspect the response content-type before parsing and
// report *why* a run produced nothing instead of silently returning [].
const ALGORA_BOUNTIES_URL =
  Deno.env.get("ALGORA_BOUNTIES_URL") ?? "https://algora.io/api/bounties?status=open&limit=50";

async function fetchAlgora(): Promise<SourceFetch> {
  const r = await fetchT(ALGORA_BOUNTIES_URL, {
    // `*/*` keeps the request acceptable to hosts that only serve HTML; a pure
    // `application/json` Accept is answered with 406 by algora.io.
    headers: { Accept: "application/json, */*" },
  });

  if (!r.ok) {
    return { opportunities: [], note: `algora: HTTP ${r.status}` };
  }

  const contentType = (r.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("text/html")) {
    const html = await r.text().catch(() => "");
    if (isAlgoraEmptyState(html)) {
      return { opportunities: [], note: "algora: no open bounties (HTML empty state)" };
    }
    return { opportunities: [], note: "algora: HTML response, no JSON bounty list available" };
  }

  if (!contentType.includes("json")) {
    return { opportunities: [], note: `algora: unsupported content-type ${contentType || "unknown"}` };
  }

  const payload = await r.json().catch(() => null);
  if (payload == null) {
    return { opportunities: [], note: "algora: response was not valid JSON" };
  }

  const opportunities = parseAlgoraBounties(payload);
  const note = opportunities.length === 0 ? "algora: JSON response contained no bounty records" : undefined;
  return { opportunities, note };
}

// Queue one real opportunity into runtime_jobs, idempotent on task_id.
async function queueOpportunity(
  sb: ReturnType<typeof createClient>,
  prefix: string,
  opp: Opportunity,
): Promise<"inserted" | "skipped"> {
  const taskId = await stableTaskId(prefix, opp.url);
  const { data: existing } = await sb
    .from("runtime_jobs")
    .select("task_id")
    .eq("task_id", taskId)
    .maybeSingle();
  if (existing) return "skipped";

  // Concrete reward => solve it; unknown reward => qualify it first via research.
  const taskKind = opp.reward_usd != null ? "bounty_solving" : "research";
  const priority = rewardPriority(opp.reward_usd);

  const { error } = await sb.from("runtime_jobs").insert({
    task_id: taskId,
    agent_role: "research_agent_external",
    status: "queued",
    task_kind: taskKind,
    priority,
    source_class: "external_discovery",
    target: opp.url,
    scope: opp.source,
    success_metric: "submit_solution_and_capture_commission",
    payload: {
      source: opp.source,
      url: opp.url,
      title: opp.title,
      reward_usd: opp.reward_usd,
      tech_stack: opp.tech_stack ?? [],
      raw: opp.raw,
    },
  });
  if (error) {
    // Unique-violation => another concurrent run won the race; treat as skip.
    if (String(error.code || "") === "23505" || /duplicate/i.test(String(error.message || ""))) return "skipped";
    throw new Error(error.message);
  }
  return "inserted";
}

const SOURCES: Array<{ name: string; prefix: string; fn: () => Promise<SourceFetch> }> = [
  { name: "gitcoin", prefix: "opp-gitcoin", fn: async () => ({ opportunities: await fetchGitcoin() }) },
  { name: "github", prefix: "opp-github", fn: async () => ({ opportunities: await fetchGithubBounties() }) },
  { name: "algora", prefix: "opp-algora", fn: fetchAlgora },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

    const reports: SourceReport[] = [];
    let totalInserted = 0;

    for (const src of SOURCES) {
      const report: SourceReport = { name: src.name, fetched: 0, inserted: 0, skipped: 0 };
      try {
        const { opportunities: opps, note } = await src.fn();
        if (note) report.note = note;
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
