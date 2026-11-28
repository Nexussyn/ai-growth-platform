// Pure, dependency-free parsing helpers for runtime-opportunity-scout.
//
// Kept out of index.ts so the parsers can be unit-tested without booting the
// edge runtime (index.ts calls Deno.serve at import time and pulls npm/jsr
// specifiers). Nothing here performs I/O.

export type Opportunity = {
  source: string;
  title: string;
  url: string;
  reward_usd: number | null;
  tech_stack?: string[];
  raw: Record<string, unknown>;
};

/** Result of querying one source. `note` explains an empty result. */
export type SourceFetch = {
  opportunities: Opportunity[];
  note?: string;
};

// Stable deterministic task_id from the source URL (idempotency key).
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

// --- Algora helpers -------------------------------------------------------

// Fields that are unambiguously denominated in whole USD dollars.
const USD_DOLLAR_KEYS = [
  "reward_usd",
  "rewardUsd",
  "amount_usd",
  "amountUsd",
  "total_amount_usd",
  "totalAmountUsd",
  "bounty_usd",
  "prize_usd",
];

// Fields that may hold either a scalar or a { amount, currency, unit } object.
const MONEY_OBJECT_KEYS = ["reward", "amount", "bounty", "prize", "total_amount", "totalAmount"];

// Tech-stack fields, in the order Algora payloads have historically used them.
const TECH_KEYS = [
  "tech_stack",
  "techStack",
  "tech",
  "stack",
  "technologies",
  "skills",
  "labels",
  "tags",
  "topics",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Coerce a JSON scalar to a finite number, or null. Never guesses. */
export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/[,\s_]/g, "").replace(/^\$/, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Read a money value whose unit may be explicit.
 *
 * Returns null when the unit cannot be determined — an ambiguous number must
 * never be reported as a reward, because that would invent a figure.
 */
export function readMoney(v: unknown): number | null {
  if (v == null) return null;

  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const raw = toFiniteNumber(o.amount ?? o.value ?? o.total ?? o.usd);
    if (raw == null) return null;
    const unit = String(o.unit ?? o.amount_unit ?? o.amountUnit ?? "").toLowerCase();
    const currency = String(o.currency ?? o.currency_code ?? o.currencyCode ?? "").toLowerCase();
    // Minor-unit amounts (Algora historically returned cents).
    if (unit.startsWith("cent") || unit === "minor") return raw / 100;
    if (currency === "usd" || currency === "usdc" || currency === "$") return raw;
    if (unit === "usd" || unit === "dollar" || unit === "dollars") return raw;
    return null;
  }

  // Bare scalar: the unit is unknown to us here, so it is not a reward yet.
  return null;
}

/**
 * Extract a real USD reward from one Algora bounty record.
 *
 * Order of trust: explicit `*_usd` fields, then a currency-tagged money object,
 * then a scalar reward next to an explicit USD currency, then a literal amount
 * written in the bounty title. Anything else yields null.
 */
export function parseAlgoraReward(it: Record<string, unknown>, title: string): number | null {
  for (const k of USD_DOLLAR_KEYS) {
    if (k in it) {
      const n = toFiniteNumber(it[k]);
      if (n != null && n > 0) return round2(n);
    }
  }

  for (const k of MONEY_OBJECT_KEYS) {
    if (k in it) {
      const n = readMoney(it[k]);
      if (n != null && n > 0) return round2(n);
    }
  }

  // Scalar reward paired with an explicit top-level currency.
  const currency = String(it.currency ?? it.currency_code ?? it.currencyCode ?? "").toLowerCase();
  if (currency === "usd" || currency === "usdc") {
    for (const k of MONEY_OBJECT_KEYS) {
      const n = toFiniteNumber(it[k]);
      if (n != null && n > 0) return round2(n);
    }
  }

  // Last resort: an amount literally written in the title ("Fix X — $500").
  return extractUsd(title);
}

/** Normalize any tech-stack-ish field into a deduped, lowercased string list. */
export function normalizeTechStack(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: unknown) => {
    if (raw == null) return;
    const s = String(raw).trim().toLowerCase();
    if (!s || s.length > 40 || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(o.name ?? o.label ?? o.value ?? o.slug);
      } else {
        push(item);
      }
    }
  } else if (typeof value === "string") {
    for (const part of value.split(/[,;|/]/)) push(part);
  }

  return out.slice(0, 12);
}

/** Collect the first non-empty tech-stack field present on a record. */
export function parseAlgoraTechStack(it: Record<string, unknown>): string[] {
  for (const k of TECH_KEYS) {
    if (k in it) {
      const stack = normalizeTechStack(it[k]);
      if (stack.length > 0) return stack;
    }
  }
  // GitHub-backed Algora bounties often nest repo topics.
  const repo = it.repository ?? it.repo;
  if (repo && typeof repo === "object") {
    const stack = normalizeTechStack((repo as Record<string, unknown>).topics);
    if (stack.length > 0) return stack;
  }
  return [];
}

/** Pick a bounty URL, tolerating the field names Algora has used over time. */
export function parseAlgoraUrl(it: Record<string, unknown>): string | null {
  for (const k of ["url", "html_url", "htmlUrl", "link", "permalink", "bounty_url"]) {
    const raw = it[k];
    if (typeof raw === "string" && /^https?:\/\/\S+$/i.test(raw.trim())) return raw.trim();
  }
  return null;
}

/** Pull the record list out of any of the response envelopes Algora may use. */
export function algoraItems(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    for (const k of ["items", "bounties", "data", "results", "records"]) {
      if (Array.isArray(o[k])) return o[k] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/**
 * Map an Algora bounty payload to normalized opportunities.
 *
 * Records without a real bounty URL are dropped: the URL is the idempotency
 * key, so accepting one would produce a task_id that cannot be re-derived.
 */
export function parseAlgoraBounties(payload: unknown): Opportunity[] {
  const out: Opportunity[] = [];
  const seen = new Set<string>();

  for (const it of algoraItems(payload)) {
    if (!it || typeof it !== "object") continue;

    const url = parseAlgoraUrl(it);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = String(it.title ?? it.task ?? it.name ?? it.summary ?? "").trim().slice(0, 200);
    const reward = parseAlgoraReward(it, title);
    const techStack = parseAlgoraTechStack(it);

    out.push({
      source: "algora",
      title: title || url,
      url,
      reward_usd: reward,
      tech_stack: techStack,
      raw: {
        id: String(it.id ?? it.bounty_id ?? ""),
        status: String(it.status ?? ""),
        org: String(it.org ?? it.organization ?? it.org_name ?? ""),
        tech_stack: techStack,
        currency: String(it.currency ?? it.currency_code ?? ""),
      },
    });
  }

  return out;
}

/**
 * True when the Algora HTML page renders its empty state.
 *
 * The public `/api/bounties` route is an HTML page, not a JSON API, so a
 * "no open bounties" body is a legitimate empty result and must not be
 * reported as a failure.
 */
export function isAlgoraEmptyState(html: string): boolean {
  return /no\s+(open\s+)?bount(y|ies)/i.test(html);
}
