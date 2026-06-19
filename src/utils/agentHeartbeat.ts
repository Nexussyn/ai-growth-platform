# TypeScript Heartbeat Utility Function

Here's a comprehensive TypeScript utility function that upserts agent status to a Supabase `agent_status` table:

```typescript
/**
 * Agent Heartbeat Utility
 * Upserts agent status to track active agents and their request counts
 */

interface AgentStatus {
  agent_id: string;
  status: 'active' | 'inactive' | 'error';
  last_request_at: string;
  requests_processed: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface HeartbeatOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Initial retry delay in milliseconds */
  retryDelay?: number;
}

class HeartbeatError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HeartbeatError';
  }
}

/**
 * Sends a heartbeat to update agent status in Supabase
 * 
 * @param agentId - Unique identifier for the agent
 * @param supabaseUrl - Supabase project URL (e.g., https://xxx.supabase.co)
 * @param serviceKey - Supabase service role key for authenticated access
 * @param metadata - Optional metadata to store with the agent status
 * @param options - Optional configuration for timeout and retries
 * 
 * @throws {HeartbeatError} When the upsert operation fails
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
  metadata?: Record<string, unknown>,
  options: HeartbeatOptions = {}
): Promise<void> {
  // Validate inputs
  if (!agentId || typeof agentId !== 'string') {
    throw new HeartbeatError('agentId is required and must be a non-empty string');
  }
  
  if (!supabaseUrl || typeof supabaseUrl !== 'string') {
    throw new HeartbeatError('supabaseUrl is required and must be a non-empty string');
  }
  
  if (!serviceKey || typeof serviceKey !== 'string') {
    throw new HeartbeatError('serviceKey is required and must be a non-empty string');
  }

  const {
    timeout = 10000,
    retries = 3,
    retryDelay = 1000
  } = options;

  // Normalize Supabase URL
  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/rest/v1/rpc/upsert_agent_heartbeat`;

  const payload = {
    p_agent_id: agentId,
    p_metadata: metadata ?? null
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new HeartbeatError(
          `Heartbeat failed: ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      // Success - exit the retry loop
      return;

    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors or client errors (4xx)
      if (error instanceof HeartbeatError && 
          error.statusCode && 
          error.statusCode >= 400 && 
          error.statusCode < 500) {
        throw error;
      }

      // If we have retries left, wait and try again
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw new HeartbeatError(
    `Heartbeat failed after ${retries + 1} attempts: ${lastError?.message}`,
    undefined,
    lastError
  );
}

/**
 * Alternative implementation using direct table upsert (without RPC)
 * Use this if you prefer not to create a database function
 */
export async function sendHeartbeatDirect(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  metadata?: Record<string, unknown>,
  options: HeartbeatOptions = {}
): Promise<void> {
  if (!agentId || !supabaseUrl || !serviceKey) {
    throw new HeartbeatError('agentId, supabaseUrl, and serviceKey are required');
  }

  const {
    timeout = 10000,
    retries = 3,
    retryDelay = 1000
  } = options;

  const baseUrl = supabaseUrl.replace(/\/$/, '');
  
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // First, get current requests_processed count
      const getResponse = await fetch(
        `${baseUrl}/rest/v1/agent_status?agent_id=eq.${encodeURIComponent(agentId)}&select=requests_processed`,
        {
          method: 'GET',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          },
          signal: controller.signal
        }
      );

      let currentCount = 0;
      if (getResponse.ok) {
        const data = await getResponse.json();
        if (data.length > 0) {
          currentCount = data[0].requests_processed ?? 0;
        }
      }

      // Upsert the record
      const upsertPayload: Partial<AgentStatus> = {
        agent_id: agentId,
        status: 'active',
        last_request_at: new Date().toISOString(),
        requests_processed: currentCount + 1,
        updated_at: new Date().toISOString()
      };

      if (metadata !== undefined) {
        upsertPayload.metadata = metadata;
      }

      const upsertResponse = await fetch(
        `${baseUrl}/rest/v1/agent_status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(upsertPayload),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!upsertResponse.ok) {
        const errorBody = await upsertResponse.text();
        throw new HeartbeatError(
          `Heartbeat upsert failed: ${upsertResponse.statusText}`,
          upsertResponse.status,
          errorBody
        );
      }

      return;

    } catch (error) {
      lastError = error as Error;

      if (error instanceof HeartbeatError && 
          error.statusCode && 
          error.statusCode >= 400 && 
          error.statusCode < 500) {
        throw error;
      }

      if (attempt < retries) {
        await sleep(retryDelay * Math.pow(2, attempt));
      }
    }
  }

  throw new HeartbeatError(
    `Heartbeat failed after ${retries + 1} attempts: ${lastError?.message}`,
    undefined,
    lastError
  );
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { HeartbeatError, HeartbeatOptions, AgentStatus };
```

## Required Database Setup

### SQL Migration for Table and Function

```sql
-- Create the agent_status table
CREATE TABLE IF NOT EXISTS agent_status (
    agent_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    last_request_at TIMESTAMPTZ DEFAULT NOW(),
    requests_processed INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for querying active agents
CREATE INDEX IF NOT EXISTS idx_agent_status_status ON agent_status(status);
CREATE INDEX IF NOT EXISTS idx_agent_status_last_request ON agent_status(last_request_at);

-- Create the upsert function (atomic increment)
CREATE OR REPLACE FUNCTION upsert_agent_heartbeat(
    p_agent_id TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO agent_status (
        agent_id,
        status,
        last_request_at,
        requests_processed,
        metadata,
        created_at,
        updated_at
    )
    VALUES (
        p_agent_id,
        'active',
        NOW(),
        1,
        COALESCE(p_metadata, '{}'::JSONB),
        NOW(),
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

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION upsert_agent_heartbeat TO service_role;

-- Optional: Function to mark inactive agents
CREATE OR REPLACE FUNCTION mark_inactive_agents(
    p_threshold_minutes INTEGER DEFAULT 5
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE agent_status
    SET status = 'inactive', updated_at = NOW()
    WHERE status = 'active'
    AND last_request_at < NOW() - (p_threshold_minutes || ' minutes')::INTERVAL;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;
```

## Usage Examples

```typescript
import { sendHeartbeat, sendHeartbeatDirect, HeartbeatError } from './heartbeat';

// Basic usage
async function main() {
  const agentId = 'worker-node-1';
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

  try {
    // Using RPC function (recommended - atomic operation)
    await sendHeartbeat(agentId, supabaseUrl, serviceKey, {
      version: '2.1.0',
      hostname: 'worker-1.example.com',
      pid: process.pid
    });
    
    console.log('Heartbeat sent successfully');
  } catch (error) {
    if (error instanceof HeartbeatError) {
      console.error(`Heartbeat failed: ${error.message}`, {
        statusCode: error.statusCode,
        details: error.details
      });
    }
    throw error;
  }
}

// Periodic heartbeat with interval
function startHeartbeatInterval(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  intervalMs: number = 30000
): () => void {
  const sendBeat = async () => {
    try {
      await sendHeartbeat(agentId, supabaseUrl, serviceKey, {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed
      });
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  };

  // Send immediately, then at interval
  sendBeat();
  const intervalId = setInterval(sendBeat, intervalMs);

  // Return cleanup function
  return () => clearInterval(intervalId);
}

// Usage with cleanup
const stopHeartbeat = startHeartbeatInterval(
  'my-agent',
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  30000 // Every 30 seconds
);

// On shutdown
process.on('SIGTERM', () => {
  stopHeartbeat();
  process.exit(0);
});
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Atomic Increment** | Uses PostgreSQL function for race-condition-safe counter increment |
| **Retry Logic** | Exponential backoff with configurable retries |
| **Timeout Handling** | AbortController for request timeouts |
| **Type Safety** | Full TypeScript types for all parameters and responses |
| **Error Handling** | Custom `HeartbeatError` with status codes and details |
| **Two Implementations** | RPC-based (atomic) and direct upsert options |