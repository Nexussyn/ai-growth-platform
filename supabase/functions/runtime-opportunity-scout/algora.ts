import type { Opportunity } from "./queue.ts";

// Public route in algora-io/algora's API router. The old /api/bounties is unavailable.
export const ALGORA_API_URL =
  "https://algora.io/api/trpc/bounty.list?status=open&limit=50";

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function itemsFromResponse(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    // Current tRPC batch envelope, not an array of bounty records.
    if (
      value.some((entry) =>
        record(entry)?.result !== undefined ||
        record(entry)?.error !== undefined
      )
    ) {
      return value.flatMap((entry) => {
        const result = record(record(entry)?.result);
        const json = record(record(result?.data)?.json);
        if (!Array.isArray(json?.items)) {
          throw new Error("Unexpected Algora tRPC response");
        }
        return json.items;
      });
    }
    return value;
  }
  const object = record(value);
  if (Array.isArray(object?.items)) return object.items;
  if (Array.isArray(object?.bounties)) return object.bounties;
  throw new Error("Unexpected Algora response: missing bounty array");
}

function finiteAmount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function rewardUsd(item: RecordValue): number | null {
  const reward = record(item.reward);
  // Official BountyJSON emits MoneyUtils.to_minor_units; USD has 100 cents.
  // Non-USD currencies must not be relabelled or silently converted to USD.
  if (reward) {
    if (reward.currency !== "USD") return null;
    const cents = finiteAmount(reward.amount);
    return cents !== null && Number.isSafeInteger(cents) ? cents / 100 : null;
  }
  // Retain the unambiguous legacy field, already denominated in USD major units.
  return finiteAmount(item.amount_usd);
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) || url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function bountyUrl(item: RecordValue, org: RecordValue | null): string | null {
  // Official router: /:org_handle/bounties/:id. Both identifiers are supplied
  // by BountyJSON, so distinct bounties on one GitHub issue keep distinct keys.
  const handle = org?.handle;
  const id = item.id;
  if (typeof handle !== "string" || !/^[A-Za-z0-9_-]+$/.test(handle)) {
    return null;
  }
  if (typeof id === "number" && (!Number.isSafeInteger(id) || id <= 0)) {
    return null;
  }
  if (typeof id !== "string" && typeof id !== "number") return null;
  if (!/^[A-Za-z0-9_-]+$/.test(String(id))) return null;
  return `https://algora.io/${handle}/bounties/${id}`;
}

export function parseAlgoraBounties(value: unknown): Opportunity[] {
  const out: Opportunity[] = [];
  const seen = new Set<string>();
  for (const candidate of itemsFromResponse(value)) {
    const item = record(candidate);
    if (!item) continue;
    const task = record(item.task);
    const org = record(item.org);
    if (item.status !== undefined && item.status !== "open") continue;
    if (task?.status !== undefined && task.status !== "open") continue;
    if (item.reward_type !== undefined && item.reward_type !== "cash") continue;
    const url = bountyUrl(item, org) ?? publicUrl(item.url) ??
      publicUrl(item.html_url) ?? publicUrl(item.link);
    const titleValue = task?.title ?? item.title ?? item.name;
    if (
      !url || seen.has(url) || typeof titleValue !== "string" ||
      !titleValue.trim()
    ) {
      continue;
    }
    const tech = [item.tech, task?.tech, org?.tech].flatMap((values) =>
      Array.isArray(values)
        ? values.filter((v): v is string => typeof v === "string" && !!v.trim())
          .map((v) => v.trim())
        : []
    );
    seen.add(url);
    out.push({
      source: "algora",
      title: titleValue.trim().slice(0, 200),
      url,
      reward_usd: rewardUsd(item),
      tech_stack: [...new Set(tech)],
      raw: item,
    });
  }
  return out;
}

export async function fetchAlgora(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<Opportunity[]> {
  const response = await fetcher(ALGORA_API_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Algora API returned HTTP ${response.status}`);
  }
  // Malformed JSON/shape becomes a source error instead of a false successful zero.
  return parseAlgoraBounties(await response.json());
}
