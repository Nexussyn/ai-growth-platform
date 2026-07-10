// runtime-opportunity-scout v1
// Opportunistic discovery of REAL paid opportunities from public external sources.
// Queries live public APIs (Gitcoin Grants Stack Indexer V2, GitHub bounty issues,
// Algora bounties) and queues each genuine opportunity into runtime_jobs for the
// agentic bridge to solve. No mocks, no fabricated rewards: if a reward is not
// actually extractable from the source it is recorded as null.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UA = "runtime-opportunity-scout/1.0 (+open-source-federation)";
const FETCH_TIMEOUT_MS = 9000;

// Normalized real opportunity shape.
type Opportunity = {
  source: string;
  title: string;
  url: string;
  reward_usd: number | null;
  tech_stack: string[];
  raw: Record<string, unknown>;
};

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

// Stable deterministic task_id from the source URL (idempotency key).
async function stableTaskId(prefix: string, key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex.slice(0, 24)}`;
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

function inferTechStack(text: string): string[] {
  const haystack = text.toLowerCase();
  const tags: string[] = [];
  const add = (tag: string, pattern: RegExp) => {
    if (pattern.test(haystack) && !tags.includes(tag)) tags.push(tag);
  };
  add("typescript", /\b(ts|typescript|javascript|sdk|react|node|npm|vite)\b/);
  add("python", /\b(python|py|django|fastapi|jupyter)\b/);
  add("ai", /\b(ai|agent|rag|llm|model|embedding|summari[sz]ation)\b/);
  add("mcp", /\bmcp\b/);
  add("database", /\b(qdrant|postgres|sqlite|chroma|vector|database|sql)\b/);
  add("aws", /\b(aws|comprehend|s3|lambda)\b/);
  add("docs", /\b(docs?|documentation|reference|content)\b/);
  return tags;
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
      tech_stack: inferTechStack(name),
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
        tech_stack: inferTechStack(`${repo} ${title} ${body}`),
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

type AlgoraApiBounty = {
  title?: unknown;
  url?: unknown;
  html_url?: unknown;
  link?: unknown;
  reward?: unknown;
  amount?: unknown;
  amount_usd?: unknown;
  reward_usd?: unknown;
  reward_formatted?: unknown;
  status?: unknown;
  org?: unknown;
  organization?: unknown;
  task?: unknown;
};

const ALGORA_API_URL = "https://algora.io/api/bounties?status=open&limit=50";
const ALGORA_FALLBACK_ORGS = [
  "PrimeIntellect-ai",
  "SCIBASE.AI",
  "unsiloed-ai",
  "daytonaio",
  "archestra-ai",
  "arakoodev",
  "tscircuit",
  "triggerdotdev",
];

function extractAlgoraReward(value: unknown, fallbackText = ""): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") return extractUsd(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const direct = extractAlgoraReward(obj.amount ?? obj.value ?? obj.usd ?? obj.cents, fallbackText);
    if (direct != null) {
      const currency = String(obj.currency ?? obj.currency_code ?? "USD").toUpperCase();
      const units = String(obj.units ?? "").toLowerCase();
      return currency === "USD" && (units === "cents" || direct >= 1000) ? direct / 100 : direct;
    }
  }
  return extractUsd(fallbackText);
}

function parseAlgoraApiItems(payload: unknown): AlgoraApiBounty[] {
  if (Array.isArray(payload)) return payload as AlgoraApiBounty[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["items", "bounties", "data", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as AlgoraApiBounty[];
  }
  return [];
}

function normalizeAlgoraApiBounty(item: AlgoraApiBounty): Opportunity | null {
  const task = item.task && typeof item.task === "object" ? (item.task as Record<string, unknown>) : {};
  const url = String(item.url || item.html_url || item.link || task.url || "");
  if (!url || !/^https?:\/\//.test(url)) return null;
  const title = String(item.title || task.title || item.task || item.reward_formatted || "Algora bounty").slice(0, 200);
  const reward = extractAlgoraReward(item.reward ?? item.amount ?? item.amount_usd ?? item.reward_usd, `${title} ${item.reward_formatted ?? ""}`);
  const techStack = inferTechStack(`${title} ${task.repo_name ?? ""} ${item.org ?? ""} ${item.organization ?? ""}`);
  return {
    source: "algora",
    title,
    url,
    reward_usd: reward,
    tech_stack: techStack,
    raw: {
      source_shape: "api",
      status: String(item.status || ""),
      org: String(item.org || item.organization || ""),
      reward_formatted: item.reward_formatted ?? null,
      task: {
        repo_name: task.repo_name ?? null,
        number: task.number ?? null,
        url: task.url ?? null,
      },
    },
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseAlgoraPageBounties(org: string, html: string): Opportunity[] {
  const text = htmlToText(html);
  const out: Opportunity[] = [];
  const seen = new Set<string>();
  const bountyPattern =
    /\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)\s+([A-Za-z0-9_.-]+)#([0-9]+)\s+(.+?)(?=\s+\d+\s+(?:days?|weeks?|months?|years?)\s+ago|\s+Image:|\s+\$\s?[0-9]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = bountyPattern.exec(text)) !== null) {
    const reward = Number(match[1].replace(/,/g, ""));
    const repo = match[2];
    const issueNumber = match[3];
    const title = match[4].replace(/\s+/g, " ").trim().slice(0, 200);
    if (!Number.isFinite(reward) || reward <= 0 || !title) continue;
    const url = `https://algora.io/${org}/bounties?status=open#${repo}-${issueNumber}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      source: "algora",
      title: `${repo}#${issueNumber} ${title}`,
      url,
      reward_usd: reward,
      tech_stack: inferTechStack(`${org} ${repo} ${title}`),
      raw: {
        source_shape: "public_org_page",
        org,
        repo,
        issue_number: Number(issueNumber),
        source_page: `https://algora.io/${org}/bounties?status=open`,
      },
    });
  }
  return out;
}

// --- Source 3: Algora public bounties (best-effort, no key) ---
// Prefer the documented public API from the bounty task. If Algora serves the
// interactive HTML shell instead of JSON, fall back to public org bounty pages.
async function fetchAlgora(): Promise<Opportunity[]> {
  const out: Opportunity[] = [];
  const seen = new Set<string>();
  const add = (opps: Opportunity[]) => {
    for (const opp of opps) {
      if (seen.has(opp.url)) continue;
      seen.add(opp.url);
      out.push(opp);
    }
  };

  const r = await fetchT(ALGORA_API_URL, {
    headers: { Accept: "application/json" },
  });
  if (r.ok) {
    const contentType = r.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const j = await r.json().catch(() => null);
      add(parseAlgoraApiItems(j).map(normalizeAlgoraApiBounty).filter((opp): opp is Opportunity => Boolean(opp)));
    } else {
      const html = await r.text().catch(() => "");
      add(parseAlgoraPageBounties("api", html));
    }
  }

  if (out.length >= 10) return out.slice(0, 50);

  for (const org of ALGORA_FALLBACK_ORGS) {
    const pageUrl = `https://algora.io/${org}/bounties?status=open`;
    const page = await fetchT(pageUrl, { headers: { Accept: "text/html" } }).catch(() => null);
    if (!page?.ok) continue;
    const html = await page.text().catch(() => "");
    add(parseAlgoraPageBounties(org, html));
    if (out.length >= 50) break;
  }

  return out.slice(0, 50);
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
      tech_stack: opp.tech_stack,
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

const SOURCES: Array<{ name: string; prefix: string; fn: () => Promise<Opportunity[]> }> = [
  { name: "gitcoin", prefix: "opp-gitcoin", fn: fetchGitcoin },
  { name: "github", prefix: "opp-github", fn: fetchGithubBounties },
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
