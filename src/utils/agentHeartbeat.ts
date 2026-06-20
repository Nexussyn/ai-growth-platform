# TypeScript Heartbeat Utility Function

Here's a comprehensive TypeScript utility function that upserts agent heartbeat data to a Supabase `agent_status` table:

```typescript
/**
 * Heartbeat utility for agent status tracking
 * Upserts agent status to Supabase with active status and incremented request count
 */

interface AgentStatusRecord {
  agent_id: string;
  status: 'active' | 'inactive' | 'error' | 'starting';
  last_request_at: string;
  requests_processed: number;
  metadata?: Record<string, unknown>;
  updated_at: string;
}

interface HeartbeatResponse {
  success: boolean;
  error?: string;
  data?: AgentStatusRecord;
}

/**
 * Sends a heartbeat to update agent status in Supabase
 * 
 * @param agentId - Unique identifier for the agent
 * @param supabaseUrl - Supabase project URL (e.g., https://xxx.supabase.co)
 * @param serviceKey - Supabase service role key for authenticated access
 * @param metadata - Optional metadata to store with the heartbeat
 * @throws Error if the upsert operation fails
 * 
 * @example
 * ```typescript
 * await sendHeartbeat(
 *   'agent-001',
 *   'https://myproject.supabase.co',
 *   'eyJhbGciOiJIUzI1NiIs...',
 *   { version: '1.0.0', region: 'us-east-1' }
 * );
 * ```
 */
export async function sendHeartbeat(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Validate inputs
  if (!agentId?.trim()) {
    throw new Error('agentId is required and cannot be empty');
  }
  
  if (!supabaseUrl?.trim()) {
    throw new Error('supabaseUrl is required and cannot be empty');
  }
  
  if (!serviceKey?.trim()) {
    throw new Error('serviceKey is required and cannot be empty');
  }

  // Normalize URL (remove trailing slash if present)
  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/rest/v1/agent_status`;

  // Build the upsert payload
  // Using raw SQL for the increment via RPC, or we fetch-then-update
  // For a true atomic increment, we'll use a two-step approach or Postgres function
  
  const now = new Date().toISOString();

  try {
    // First, try to get current record to increment requests_processed
    const getResponse = await fetch(
      `${endpoint}?agent_id=eq.${encodeURIComponent(agentId)}&select=requests_processed`,
      {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!getResponse.ok) {
      throw new Error(`Failed to fetch current status: ${getResponse.status} ${getResponse.statusText}`);
    }

    const existingRecords = await getResponse.json() as Pick<AgentStatusRecord, 'requests_processed'>[];
    const currentCount = existingRecords.length > 0 ? existingRecords[0].requests_processed : 0;

    // Prepare upsert payload
    const payload: Partial<AgentStatusRecord> = {
      agent_id: agentId,
      status: 'active',
      last_request_at: now,
      requests_processed: currentCount + 1,
      updated_at: now,
    };

    // Only include metadata if provided
    if (metadata !== undefined) {
      payload.metadata = metadata;
    }

    // Perform upsert (insert or update on conflict)
    const upsertResponse = await fetch(
      `${endpoint}?on_conflict=agent_id`,
      {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!upsertResponse.ok) {
      const errorBody = await upsertResponse.text();
      throw new Error(
        `Heartbeat upsert failed: ${upsertResponse.status} ${upsertResponse.statusText} - ${errorBody}`
      );
    }

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`sendHeartbeat failed: ${error.message}`);
    }
    throw new Error('sendHeartbeat failed with unknown error');
  }
}

/**
 * Alternative version using Supabase RPC for atomic increment
 * Requires a Postgres function to be created (see below)
 */
export async function sendHeartbeatAtomic(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!agentId?.trim()) {
    throw new Error('agentId is required and cannot be empty');
  }
  
  if (!supabaseUrl?.trim()) {
    throw new Error('supabaseUrl is required and cannot be empty');
  }
  
  if (!serviceKey?.trim()) {
    throw new Error('serviceKey is required and cannot be empty');
  }

  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const rpcEndpoint = `${baseUrl}/rest/v1/rpc/upsert_agent_heartbeat`;

  const payload = {
    p_agent_id: agentId,
    p_metadata: metadata ?? null,
  };

  const response = await fetch(rpcEndpoint, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Atomic heartbeat failed: ${response.status} ${response.statusText} - ${errorBody}`
    );
  }
}

/**
 * Heartbeat with retry logic for resilience
 */
export async function sendHeartbeatWithRetry(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  metadata?: Record<string, unknown>,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<void> {
  const {
    maxRetries = 3,
    retryDelayMs = 1000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | null = null;
  let delay = retryDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendHeartbeat(agentId, supabaseUrl, serviceKey, metadata);
      return; // Success, exit
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }
  }

  throw new Error(
    `sendHeartbeat failed after ${maxRetries} attempts: ${lastError?.message}`
  );
}

// Export types for consumers
export type { AgentStatusRecord, HeartbeatResponse };
```

## SQL Schema for Supabase

```sql
-- Create the agent_status table
CREATE TABLE IF NOT EXISTS agent_status (
  agent_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'inactive' 
    CHECK (status IN ('active', 'inactive', 'error', 'starting')),
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requests_processed INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for status queries
CREATE INDEX idx_agent_status_status ON agent_status(status);
CREATE INDEX idx_agent_status_last_request ON agent_status(last_request_at);

-- Optional: Atomic upsert function for sendHeartbeatAtomic
CREATE OR REPLACE FUNCTION upsert_agent_heartbeat(
  p_agent_id TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO agent_status (
    agent_id, 
    status, 
    last_request_at, 
    requests_processed, 
    metadata,
    updated_at
  )
  VALUES (
    p_agent_id,
    'active',
    NOW(),
    1,
    p_metadata,
    NOW()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    status = 'active',
    last_request_at = NOW(),
    requests_processed = agent_status.requests_processed + 1,
    metadata = COALESCE(p_metadata, agent_status.metadata),
    updated_at = NOW();
END;
$$;

-- Enable RLS (Row Level Security) if needed
ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;

-- Policy for service role (full access)
CREATE POLICY "Service role has full access" ON agent_status
  FOR ALL
  USING (auth.role() = 'service_role');
```

## Usage Examples

```typescript
import { 
  sendHeartbeat, 
  sendHeartbeatAtomic, 
  sendHeartbeatWithRetry 
} from './heartbeat';

// Basic usage
async function main() {
  const agentId = 'my-agent-001';
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

  // Simple heartbeat
  await sendHeartbeat(agentId, supabaseUrl, serviceKey);

  // With metadata
  await sendHeartbeat(agentId, supabaseUrl, serviceKey, {
    version: '2.1.0',
    hostname: 'worker-node-3',
    memoryUsage: process.memoryUsage().heapUsed,
    uptime: process.uptime(),
  });

  // With retry logic for production
  await sendHeartbeatWithRetry(agentId, supabaseUrl, serviceKey, {
    currentTask: 'processing-batch-42',
  }, {
    maxRetries: 5,
    retryDelayMs: 500,
    backoffMultiplier: 2,
  });

  // Using atomic version (requires the Postgres function)
  await sendHeartbeatAtomic(agentId, supabaseUrl, serviceKey, {
    lastProcessedId: 12345,
  });
}

// Periodic heartbeat pattern
function startHeartbeatInterval(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  intervalMs: number = 30000
): () => void {
  const intervalId = setInterval(async () => {
    try {
      await sendHeartbeatWithRetry(agentId, supabaseUrl, serviceKey, {
        timestamp: Date.now(),
      });
      console.log(`Heartbeat sent for agent: ${agentId}`);
    } catch (error) {
      console.error(`Heartbeat failed for agent ${agentId}:`, error);
    }
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(intervalId);
}
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Input Validation** | Validates all required parameters before making requests |
| **Atomic Increment** | Optional RPC-based atomic increment for high-concurrency scenarios |
| **Retry Logic** | Exponential backoff retry mechanism for resilience |
| **Type Safety** | Full TypeScript types for all inputs and outputs |
| **Metadata Support** | Optional JSON metadata storage per heartbeat |
| **No Dependencies** | Uses native `fetch` API (available in Node 18+, Deno, Bun, browsers) |