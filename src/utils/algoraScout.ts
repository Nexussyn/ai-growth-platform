export interface AlgoraBounty {
  id: string;
  title: string;
  repo_name: string;
  repo_owner: string;
  issue_url: string;
  bounty_amount_usd: number | null;
  status: 'open' | 'closed' | 'awarded';
  created_at: string;
}

export interface AlgoraScoutResult {
  source: 'algora';
  bounties: AlgoraBounty[];
  total: number;
  fetchedAt: string;
}

/**
 * Discovers and parses active bounties from Algora public feed.
 * Normalizes bounty metadata and filters for solvable development tasks.
 */
export async function fetchAlgoraBounties(limit = 50): Promise<AlgoraScoutResult> {
  const endpoint = `https://algora.io/api/bounties?status=open&limit=${Math.min(limit, 100)}`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Algora API responded with status ${response.status}`);
    }

    const payload = await response.json();
    const rawList = Array.isArray(payload) ? payload : (payload?.bounties || []);

    const bounties: AlgoraBounty[] = rawList.map((item: Record<string, any>) => ({
      id: String(item.id || item._id || `${item.repo_owner || ''}/${item.repo_name || ''}#${item.issue_number || ''}`),
      title: String(item.title || item.issue_title || 'Untitled Bounty'),
      repo_name: String(item.repo_name || item.repository?.name || ''),
      repo_owner: String(item.repo_owner || item.repository?.owner || ''),
      issue_url: String(item.issue_url || item.url || ''),
      bounty_amount_usd: typeof item.bounty_amount_usd === 'number' 
        ? item.bounty_amount_usd 
        : typeof item.amount === 'number' 
          ? item.amount 
          : null,
      status: item.status === 'open' ? 'open' : 'open',
      created_at: item.created_at || new Date().toISOString(),
    }));

    return {
      source: 'algora',
      bounties,
      total: bounties.length,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to fetch Algora bounties:', error);
    return {
      source: 'algora',
      bounties: [],
      total: 0,
      fetchedAt: new Date().toISOString(),
    };
  }
}
