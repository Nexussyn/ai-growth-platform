# TypeScript Heartbeat Utility Function

Here's a comprehensive TypeScript utility function that sends heartbeats to an `agent_status` table in Supabase:

```typescript
/**
 * Heartbeat utility for agent status tracking
 * Upserts to agent_status table with active status and incremented request counter
 */

interface AgentStatusRecord {
  agent_id: string;
  status: 'active' | 'inactive' | 'error';
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
 * Sends a heartbeat to the agent_status table, upserting the agent's status
 * 
 * @param agentId - Unique identifier for the agent
 * @param supabaseUrl - Supabase project URL (e.g., https://xxx.supabase.co)
 * @param serviceKey - Supabase service role key for authentication
 * @param metadata - Optional metadata to store with the agent status
 * @throws Error if the upsert operation fails
 * 
 * @example
 * ```typescript
 * await sendHeartbeat(
 *   'agent-123',
 *   'https://myproject.supabase.co',
 *   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
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

  // Build the upsert payload using raw SQL for increment
  // We need to use RPC or a specific approach for increment
  const now = new Date().toISOString();

  // First, try to get existing record to increment counter
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

  if (!getResponse.ok && getResponse.status !== 404) {
    const errorText = await getResponse.text();
    throw new Error(`Failed to fetch existing agent status: ${getResponse.status} - ${errorText}`);
  }

  let currentCount = 0;
  if (getResponse.ok) {
    const existingData = await getResponse.json() as { requests_processed: number }[];
    if (existingData.length > 0) {
      currentCount = existingData[0].requests_processed ?? 0;
    }
  }

  // Build upsert payload
  const payload: Record<string, unknown> = {
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

  // Perform upsert using Supabase REST API
  const upsertResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates', // Upsert behavior
    },
    body: JSON.stringify(payload),
  });

  if (!upsertResponse.ok) {
    const errorText = await upsertResponse.text();
    throw new Error(
      `Failed to send heartbeat for agent ${agentId}: ${upsertResponse.status} - ${errorText}`
    );
  }
}

/**
 * Alternative version using Supabase RPC for atomic increment
 * Requires a PostgreSQL function to be created (see below)
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
  const endpoint = `${baseUrl}/rest/v1/rpc/upsert_agent_heartbeat`;

  const payload = {
    p_agent_id: agentId,
    p_metadata: metadata ?? null,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to send heartbeat for agent ${agentId}: ${response.status} - ${errorText}`
    );
  }
}

/**
 * Version with retry logic and exponential backoff
 */
export async function sendHeartbeatWithRetry(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  metadata?: Record<string, unknown>,
  options?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<void> {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 5000;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await sendHeartbeat(agentId, supabaseUrl, serviceKey, metadata);
      return; // Success, exit
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          initialDelayMs * Math.pow(2, attempt) + Math.random() * 100,
          maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to send heartbeat after ${maxRetries + 1} attempts: ${lastError?.message}`
  );
}

// Export types for consumers
export type { AgentStatusRecord, HeartbeatResponse };
```

## Required Database Schema

```sql
-- Create the agent_status table
CREATE TABLE IF NOT EXISTS agent_status (
  agent_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requests_processed INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying active agents
CREATE INDEX IF NOT EXISTS idx_agent_status_status ON agent_status(status);
CREATE INDEX IF NOT EXISTS idx_agent_status_last_request ON agent_status(last_request_at);

-- Optional: RPC function for atomic upsert with increment
CREATE OR REPLACE FUNCTION upsert_agent_heartbeat(
  p_agent_id TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO agent_status (agent_id, status, last_request_at, requests_processed, metadata, updated_at)
  VALUES (p_agent_id, 'active', NOW(), 1, p_metadata, NOW())
  ON CONFLICT (agent_id) DO UPDATE SET
    status = 'active',
    last_request_at = NOW(),
    requests_processed = agent_status.requests_processed + 1,
    metadata = COALESCE(p_metadata, agent_status.metadata),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
```

## Usage Examples

```typescript
// Basic usage
await sendHeartbeat(
  'worker-node-1',
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// With metadata
await sendHeartbeat(
  'worker-node-1',
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    version: '2.1.0',
    region: 'us-west-2',
    taskType: 'image-processing',
    cpuUsage: 45.2,
  }
);

// With retry logic
await sendHeartbeatWithRetry(
  'worker-node-1',
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { version: '2.1.0' },
  { maxRetries: 5, initialDelayMs: 200 }
);

// Periodic heartbeat pattern
class AgentHeartbeat {
  private intervalId?: NodeJS.Timeout;

  constructor(
    private agentId: string,
    private supabaseUrl: string,
    private serviceKey: string,
    private intervalMs: number = 30000
  ) {}

  start(metadata?: Record<string, unknown>): void {
    this.sendBeat(metadata); // Send immediately
    this.intervalId = setInterval(() => this.sendBeat(metadata), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async sendBeat(metadata?: Record<string, unknown>): Promise<void> {
    try {
      await sendHeartbeatWithRetry(
        this.agentId,
        this.supabaseUrl,
        this.serviceKey,
        metadata
      );
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }
}

// Usage
const heartbeat = new AgentHeartbeat(
  'my-agent',
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  30000 // Every 30 seconds
);

heartbeat.start({ version: '1.0.0' });

// On shutdown
process.on('SIGTERM', () => heartbeat.stop());
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Input Validation** | Validates all required parameters before making requests |
| **Atomic Increment** | RPC version ensures thread-safe counter increment |
| **Retry Logic** | Exponential backoff with jitter for resilience |
| **Type Safety** | Full TypeScript types for all inputs and outputs |
| **Metadata Support** | Optional JSON metadata storage |
| **No Dependencies** | Uses native `fetch` API only |