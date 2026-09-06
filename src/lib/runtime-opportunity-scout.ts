import db from './db';                  // assume database module
import crypto from 'node:crypto';

const ALGORA_API = 'https://algora.io/api/bounties?status=open&limit=50';

interface AlgoraBounty {
  title: string;
  url: string;         // full URL to the bounty
  reward_usd: number | null;
  techStack: string[]; // languages / tags
}

// Helper: extract USD reward from Algora's response.
// The API returns reward in various forms; we only trust explicit USD amounts.
function parseRewardUsd(bounty: Record<string, any>): number | null {
  const reward = bounty.reward;
  if (!reward) return null;
  if (typeof reward === 'number') return reward;
  if (typeof reward === 'string') {
    // examples: "$500", "500 USD", "500"
    const match = reward.match(/^\$?(\d+(?:\.\d{1,2})?)\s*(?:USD)?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      return isNaN(num) ? null : num;
    }
  }
  // structured object: { amount: 500, currency: "USD" }
  if (typeof reward === 'object' && reward.amount !== undefined && reward.currency === 'USD') {
    const num = parseFloat(reward.amount);
    return isNaN(num) ? null : num;
  }
  return null;
}

async function fetchAlgoraBounties(): Promise<AlgoraBounty[]> {
  const response = await fetch(ALGORA_API, {
    headers: { 'Accept': 'application/json' }
  });
  if (!response.ok) {
    console.error(`Algora API error: ${response.status} ${response.statusText}`);
    return [];
  }
  const data: any = await response.json();
  const bounties: any[] = data?.bounties ?? data?.results ?? (Array.isArray(data) ? data : []);

  return bounties.map((b: any) => {
    // Algora returns an HTML URL; fallback to API URL if missing
    const url = b.url || b.html_url || '';
    const title = b.title || b.name || '';
    const techStack: string[] = [];
    if (b.languages && Array.isArray(b.languages)) {
      techStack.push(...b.languages.map((l: any) => typeof l === 'string' ? l : l.name || l));
    }
    if (b.tags && Array.isArray(b.tags)) {
      techStack.push(...b.tags.map((t: any) => typeof t === 'string' ? t : t.name || t));
    }
    return {
      title,
      url,
      reward_usd: parseRewardUsd(b),
      techStack
    };
  }).filter(b => b.title && b.url); // only keep entries with at least title and url
}

async function insertAlgoraBounties(bounties: AlgoraBounty[]): Promise<number> {
  const insertSQL = `
    INSERT INTO runtime_jobs (task_id, title, url, reward_usd, tech_stack, source)
    VALUES ($1, $2, $3, $4, $5, 'algora')
    ON CONFLICT (task_id) DO NOTHING
  `;
  let inserted = 0;
  for (const b of bounties) {
    const taskId = crypto.createHash('sha1').update(b.url).digest('hex');
    const techStackStr = JSON.stringify(b.techStack);
    try {
      await db.query(insertSQL, [
        taskId,
        b.title,
        b.url,
        b.reward_usd,
        techStackStr
      ]);
      inserted++;
    } catch (err) {
      console.error(`Algora insert error for ${b.url}:`, err);
    }
  }
  return inserted;
}

export async function scoutAlgora(): Promise<void> {
  console.log('[Algora Scout] Fetching bounties...');
  const bounties = await fetchAlgoraBounties();
  console.log(`[Algora Scout] Found ${bounties.length} bounties`);
  if (bounties.length === 0) {
    console.log('[Algora Scout] No bounties to insert.');
    return;
  }
  const count = await insertAlgoraBounties(bounties);
  console.log(`[Algora Scout] Inserted ${count} new bounties.`);
}

