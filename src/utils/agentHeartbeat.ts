# TypeScript Heartbeat Utility Function

Here's a comprehensive TypeScript utility function that sends heartbeat updates to a Supabase `agent_status` table:

```typescript
/**
 * Heartbeat utility for agent status tracking
 * Upserts agent status with active state, timestamp, and incremented request counter
 */

interface AgentStatusRecord {
  agent_id: string;
  status: 'active' | 'idle' | 'offline' | 'error';
  last_request_at: string;
  requests_processed: number;
  metadata?: Record<string, unknown>;
  updated_at: string;
}

interface HeartbeatOptions {
  /** Timeout for the request in milliseconds */
  timeout?: number;
  /** Number of retry attempts on failure */
  retries?: number;
  /** Initial status if record doesn't exist */
  initialStatus?: AgentStatusRecord['status'];
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
 * @param serviceKey - Supabase service role key for authentication
 * @param metadata - Optional metadata to store with the agent status
 * @param options - Optional configuration for the heartbeat request
 * 
 * @throws {HeartbeatError} When the upsert operation fails
 * 
 * @example
 * ```typescript
 * await sendHeartbeat(
 *   'agent-001',
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
  const {
    timeout = 10000,
    retries = 3,
    initialStatus = 'active'
  } = options;

  // Validate inputs
  if (!agentId?.trim()) {
    throw new HeartbeatError('agentId is required and cannot be empty');
  }
  if (!supabaseUrl?.trim()) {
    throw new HeartbeatError('supabaseUrl is required and cannot be empty');
  }
  if (!serviceKey?.trim()) {
    throw new HeartbeatError('serviceKey is required and cannot be empty');
  }

  // Normalize Supabase URL
  const normalizedUrl = supabaseUrl.replace(/\/$/, '');
  const endpoint = `${normalizedUrl}/rest/v1/rpc/upsert_agent_heartbeat`;

  const payload = {
    p_agent_id: agentId,
    p_status: 'active',
    p_metadata: metadata ?? null
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
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
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new HeartbeatError(
          `Heartbeat failed with status ${response.status}: ${errorBody}`,
          response.status,
          errorBody
        );
      }

      // Success - exit the retry loop
      return;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof HeartbeatError) {
        lastError = error;
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = new HeartbeatError(`Heartbeat request timed out after ${timeout}ms`);
        } else {
          lastError = new HeartbeatError(`Heartbeat request failed: ${error.message}`);
        }
      } else {
        lastError = new HeartbeatError('Heartbeat request failed with unknown error');
      }

      // Don't retry on client errors (4xx)
      if (lastError instanceof HeartbeatError && 
          lastError.statusCode && 
          lastError.statusCode >= 400 && 
          lastError.statusCode < 500) {
        throw lastError;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All retries exhausted
  throw lastError ?? new HeartbeatError('Heartbeat failed after all retry attempts');
}

/**
 * Alternative version using direct table upsert instead of RPC
 * Use this if you prefer not to create a database function
 */
export async function sendHeartbeatDirect(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  metadata?: Record<string, unknown>,
  options: HeartbeatOptions = {}
): Promise<void> {
  const { timeout = 10000, retries = 3 } = options;

  if (!agentId?.trim()) {
    throw new HeartbeatError('agentId is required and cannot be empty');
  }
  if (!supabaseUrl?.trim()) {
    throw new HeartbeatError('supabaseUrl is required and cannot be empty');
  }
  if (!serviceKey?.trim()) {
    throw new HeartbeatError('serviceKey is required and cannot be empty');
  }

  const normalizedUrl = supabaseUrl.replace(/\/$/, '');
  const endpoint = `${normalizedUrl}/rest/v1/agent_status`;

  // First, try to get current requests_processed count
  let currentCount = 0;
  
  try {
    const getResponse = await fetch(
      `${endpoint}?agent_id=eq.${encodeURIComponent(agentId)}&select=requests_processed`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );

    if (getResponse.ok) {
      const data = await getResponse.json();
      if (Array.isArray(data) && data.length > 0) {
        currentCount = data[0].requests_processed ?? 0;
      }
    }
  } catch {
    // If we can't get the current count, start from 0
    currentCount = 0;
  }

  const now = new Date().toISOString();
  const payload: Partial<AgentStatusRecord> = {
    agent_id: agentId,
    status: 'active',
    last_request_at: now,
    requests_processed: currentCount + 1,
    updated_at: now,
    ...(metadata && { metadata })
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new HeartbeatError(
          `Heartbeat failed with status ${response.status}: ${errorBody}`,
          response.status,
          errorBody
        );
      }

      return;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof HeartbeatError) {
        lastError = error;
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = new HeartbeatError(`Heartbeat request timed out after ${timeout}ms`);
        } else {
          lastError = new HeartbeatError(`Heartbeat request failed: ${error.message}`);
        }
      } else {
        lastError = new HeartbeatError('Heartbeat request failed with unknown error');
      }

      if (lastError instanceof HeartbeatError && 
          lastError.statusCode && 
          lastError.statusCode >= 400 && 
          lastError.statusCode < 500) {
        throw lastError;
      }

      if (attempt < retries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError ?? new HeartbeatError('Heartbeat failed after all retry attempts');
}
```

## Required Supabase Database Setup

### SQL Migration for the `agent_status` Table

```sql
-- Create the agent_status table
CREATE TABLE IF NOT EXISTS agent_status (
  agent_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'offline', 'error')),
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requests_processed BIGINT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for querying by status
CREATE INDEX IF NOT EXISTS idx_agent_status_status ON agent_status(status);

-- Create index for querying stale agents
CREATE INDEX IF NOT EXISTS idx_agent_status_last_request ON agent_status(last_request_at);

-- Create the upsert function for atomic increment
CREATE OR REPLACE FUNCTION upsert_agent_heartbeat(
  p_agent_id TEXT,
  p_status TEXT DEFAULT 'active',
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
    updated_at
  )
  VALUES (
    p_agent_id,
    p_status,
    NOW(),
    1,
    p_metadata,
    NOW()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    status = EXCLUDED.status,
    last_request_at = NOW(),
    requests_processed = agent_status.requests_processed + 1,
    metadata = COALESCE(EXCLUDED.metadata, agent_status.metadata),
    updated_at = NOW();
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION upsert_agent_heartbeat TO service_role;

-- Enable RLS (optional but recommended)
ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;

-- Policy for service role to manage all records
CREATE POLICY "Service role can manage all agent status" ON agent_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

## Usage Examples

```typescript
import { sendHeartbeat, sendHeartbeatDirect } from './heartbeat';

// Basic usage with RPC function (recommended - atomic increment)
async function basicHeartbeat() {
  await sendHeartbeat(
    'agent-001',
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// With metadata
async function heartbeatWithMetadata() {
  await sendHeartbeat(
    'agent-001',
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      version: '2.1.0',
      region: 'us-east-1',
      currentTask: 'processing-batch-42',
      memoryUsageMB: 512
    }
  );
}

// With custom options
async function heartbeatWithOptions() {
  await sendHeartbeat(
    'agent-001',
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { taskCount: 5 },
    {
      timeout: 5000,    // 5 second timeout
      retries: 5,       // 5 retry attempts
    }
  );
}

// Periodic heartbeat in a service
class AgentService {
  private heartbeatInterval?: NodeJS.Timeout;
  
  constructor(
    private agentId: string,
    private supabaseUrl: string,
    private serviceKey: string
  ) {}

  start(intervalMs: number = 30000) {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await sendHeartbeat(
          this.agentId,
          this.supabaseUrl,
          this.serviceKey,
          { lastHeartbeat: new Date().toISOString() }
        );
        console.log(`Heartbeat sent for ${this.agentId}`);
      } catch (error) {
        console.error(`Heartbeat failed for ${this.agentId}:`, error);
      }
    }, intervalMs);
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

// Direct table upsert (if you can't create the RPC function)
async function directHeartbeat() {
  await sendHeartbeatDirect(
    'agent-001',
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { note: 'Using direct upsert' }
  );
}
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Atomic Increment** | Uses PostgreSQL function for race-condition-free counter updates |
| **Retry Logic** | Exponential backoff with configurable retry attempts |
| **Timeout Handling** | Configurable request timeouts with AbortController |
| **Input Validation** | Validates required parameters before making requests |
| **Error Handling** | Custom error class with status codes and details |
| **Type Safety** | Full TypeScript types for all parameters and responses |