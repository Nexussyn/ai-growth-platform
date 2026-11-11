// runtime-opportunity-scout v1.1
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

const UA = "runtime-opportunity-scout/1.1 (+open-source-federation)";
const FETCH_TIMEOUT_MS = 9000;

// Normalized real opportunity shape.
export type Opportunity = {
  source: string;
  title: string;
  url: string;
  reward_usd: number | null;
  tech_stack?: string[];
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

// Stable deterministic task_id from the source URL (idempotency key via SHA-1).
export async function stableTaskId(prefix: string, key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex.slice(0, 24)}`;
}

// Best-effort USD amount extraction from free text. Returns null when nothing
// is genuinely present — we never invent a number.
export function extractUsd(text: string): number | null {
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

const KNOWN_TECH_KEYWORDS = [
  "typescript", "javascript", "python", "rust", "go", "golang", "solidity",
  "elixir", "react", "nextjs", "next.js", "deno", "supabase", "postgres",
  "postgresql", "graphql", "docker", "kubernetes", "tailwind", "scala", "java",
  "c++", "csharp", "c#", "ruby", "php", "swift", "kotlin", "solana", "ethereum",
];

// Extracts explicit tech_stack arrays/fields or known stack tags from text/labels.
export function extractTechStack(item: Record<string, unknown>, fallbackText = ""): string[] {
  const stack = new Set<string>();
  const directCandidates = [
    item.tech_stack,
    item.techStack,
    item.technologies,
    item.languages,
    item.tags,
    item.labels,
  ];
  for (const cand of directCandidates) {
    if (Array.isArray(cand)) {
      for (const el of cand) {
        if (typeof el === "string" && el.trim()) {
          stack.add(el.trim().toLowerCase());
        } else if (el && typeof el === "object" && "name" in (el as Record<string, unknown>)) {
          const name = String((el as Record<string, unknown>).name || "").trim();
          if (name) stack.add(name.toLowerCase());
        }
      }
    } else if (typeof cand === "string" && cand.trim()) {
      for (const part of cand.split(/[,;|]/)) {
        if (part.trim()) stack.add(part.trim().toLowerCase());
      }
    }
  }
  const haystack = `${fallbackText} ${String(item.title || "")} ${String(item.body || "")}`.toLowerCase();
  for (const kw of KNOWN_TECH_KEYWORDS) {
    const escaped = kw.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack)) {
      stack.add(kw);
    }
  }
  return Array.from(stack);
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
    const url = `https://explorer.gitcoin.co/#/round/${chainId}/${id}`;
    const match = Number(rd.matchAmountInUsd ?? 0);
    const donated = Number(rd.totalAmountDonatedInUsd ?? 0);
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
      const techStack = extractTechStack({ labels, title, body }, repo);
      out.push({
        source: "github",
        title,
        url: html,
        reward_usd: reward,
        tech_stack: techStack,
        raw: {
          repo,
          number: Number(it.number ?? 0),
          state: String(it.state || ""),
          labels,
          tech_stack: techStack,
          comments: Number(it.comments ?? 0),
          updated_at: String(it.updated_at || ""),
          query: q,
        },
      });
    }
  }
  return out;
}

// Parses normalized Opportunity items from an Algora JSON payload.
// Never invents a reward if not present in the response.
export function parseAlgoraJsonItems(j: unknown): Opportunity[] {
  const record = (j && typeof j === "object") ? (j as Record<string, unknown>) : {};
  const trpcItems = ((record.result as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.items;
  const items: Array<Record<string, unknown>> = Array.isArray(j)
    ? (j as Array<Record<string, unknown>>)
    : Array.isArray(record.items)
    ? (record.items as Array<Record<string, unknown>>)
    : Array.isArray(record.bounties)
    ? (record.bounties as Array<Record<string, unknown>>)
    : Array.isArray(trpcItems)
    ? (trpcItems as Array<Record<string, unknown>>)
    : [];

  const out: Opportunity[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const taskObj = (it.task as Record<string, unknown> | null) || null;
    const url = String(
      it.url ||
      it.html_url ||
      it.issue_url ||
      it.link ||
      (taskObj && (taskObj.url || taskObj.html_url)) ||
      "",
    );
    if (!url || !/^https?:\/\//.test(url) || seen.has(url)) continue;
    seen.add(url);

    const rawTitle = String(
      it.title ||
      (taskObj && taskObj.title) ||
      (typeof it.task === "string" ? it.task : "") ||
      it.name ||
      "",
    ).slice(0, 200);

    // Strictly parse real reward; never invent a reward if absent.
    const rewardObj = (it.reward as Record<string, unknown> | null) ||
      (it.amount as Record<string, unknown> | null) ||
      null;
    let reward: number | null = null;
    if (rewardObj && typeof rewardObj === "object" && "amount" in rewardObj) {
      const cents = Number((rewardObj as Record<string, unknown>).amount ?? NaN);
      if (Number.isFinite(cents) && cents > 0) reward = cents / 100;
    } else if (typeof it.reward_usd === "number" && Number.isFinite(it.reward_usd) && it.reward_usd > 0) {
      reward = it.reward_usd;
    } else if (typeof it.amount_usd === "number" && Number.isFinite(it.amount_usd) && it.amount_usd > 0) {
      reward = it.amount_usd;
    } else if (typeof it.reward_formatted === "string") {
      reward = extractUsd(it.reward_formatted);
    } else {
      reward = extractUsd(rawTitle);
    }

    const org = String(it.org || it.organization || (taskObj && taskObj.repo_owner) || "");
    const repo = String(it.repo || (taskObj && taskObj.repo_name) || "");
    const techStack = extractTechStack(it, `${org}/${repo} ${rawTitle}`);

    out.push({
      source: "algora",
      title: rawTitle || `Algora bounty (${url})`,
      url,
      reward_usd: reward,
      tech_stack: techStack,
      raw: {
        status: String(it.status || "open"),
        org,
        repo,
        tech_stack: techStack,
      },
    });
  }
  return out;
}

// Public HTML fallback parser for https://algora.io/bounties when API requires a key.
export function parseAlgoraHtmlFallback(html: string): Opportunity[] {
  if (!html) return [];
  const out: Opportunity[] = [];
  const seen = new Set<string>();

  // 1. Check __NEXT_DATA__ JSON payload if embedded in the page
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextJson = JSON.parse(nextDataMatch[1]);
      const pageProps = nextJson?.props?.pageProps ?? {};
      const parsed = parseAlgoraJsonItems(pageProps.bounties ?? pageProps.initialBounties ?? pageProps);
      for (const p of parsed) {
        if (!seen.has(p.url)) {
          seen.add(p.url);
          out.push(p);
        }
      }
    } catch {
      // Ignore malformed __NEXT_DATA__
    }
  }

  // 2. Extract GitHub issue links paired with nearby bounty context
  const ghIssueRegex = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([0-9]+)/g;
  let match: RegExpExecArray | null;
  while ((match = ghIssueRegex.exec(html)) !== null) {
    const url = match[0];
    if (seen.has(url)) continue;
    seen.add(url);
    const owner = match[1];
    const repo = match[2];
    const issueNum = match[3];
    const windowStart = Math.max(0, match.index - 240);
    const windowEnd = Math.min(html.length, match.index + 240);
    const snippet = html.slice(windowStart, windowEnd).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const reward = extractUsd(snippet);
    const techStack = extractTechStack({}, `${owner}/${repo} ${snippet}`);
    out.push({
      source: "algora",
      title: `${owner}/${repo}#${issueNum}`,
      url,
      reward_usd: reward,
      tech_stack: techStack,
      raw: {
        status: "open",
        org: owner,
        repo,
        tech_stack: techStack,
        fallback: "html",
      },
    });
  }
  return out;
}

// --- Source 3: Algora public bounties (JSON API + public HTML fallback) ---
async function fetchAlgora(): Promise<Opportunity[]> {
  const apiEndpoints = [
    "https://algora.io/api/bounties?status=open&limit=50",
    "https://console.algora.io/api/bounties?status=open&limit=50",
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const r = await fetchT(endpoint, { headers: { Accept: "application/json" } });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        const parsed = parseAlgoraJsonItems(j);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // Try next endpoint or fallback
    }
  }

  // Public HTML fallback if JSON API requires an API key or returns empty
  try {
    const htmlResp = await fetchT("https://algora.io/bounties", {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (htmlResp.ok) {
      const html = await htmlResp.text();
      const parsedHtml = parseAlgoraHtmlFallback(html);
      if (parsedHtml.length > 0) return parsedHtml.slice(0, 50);
    }
  } catch {
    // Ignore HTML fallback failure
  }

  return [];
}

// Queue one real opportunity into runtime_jobs, idempotent on SHA-1 task_id of URL.
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

const SOURCES: Array<{ name: string; prefix: string; fn: () => Promise<Opportunity[]> }> = [
  { name: "gitcoin", prefix: "opp-gitcoin", fn: fetchGitcoin },
  { name: "github", prefix: "opp-github", fn: fetchGithubBounties },
  { name: "algora", prefix: "opp-algora", fn: fetchAlgora },
];

if (import.meta.main) {
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
              report.skipped++;
              report.error = e instanceof Error ? e.message : String(e);
            }
          }
        } catch (e) {
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
}
