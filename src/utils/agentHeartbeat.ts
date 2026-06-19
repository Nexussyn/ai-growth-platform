# TypeScript Heartbeat Utility Function

Here's a comprehensive TypeScript utility function that upserts to an `agent_status` table using the Supabase client:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Agent status record structure in the database
 */
interface AgentStatus {
  agent_id: string;
  status: 'active' | 'inactive' | 'error' | 'starting';
  last_request_at: string;
  requests_processed: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Error class for heartbeat-specific errors
 */
class HeartbeatError extends Error {
  constructor(
    message: string,
    public readonly agentId: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'HeartbeatError';
  }
}

/**
 * Sends a heartbeat to update agent status in Supabase.
 * 
 * This function performs an upsert operation on the `agent_status` table:
 * - Sets status to 'active'
 * - Updates last_request_at to current timestamp
 * - Increments requests_processed counter
 * - Optionally updates metadata
 * 
 * @param agentId - Unique identifier for the agent
 * @param supabaseUrl - Supabase project URL
 * @param serviceKey - Supabase service role key (for server-side operations)
 * @param metadata - Optional additional metadata to store with the agent status
 * @throws {HeartbeatError} If the upsert operation fails
 * 
 * @example
 * ```typescript
 * await sendHeartbeat(
 *   'agent-001',
 *   'https://your-project.supabase.co',
 *   'your-service-key',
 *   { version: '1.0.0', region: 'us-west-2' }
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
    throw new HeartbeatError('Agent ID is required', agentId);
  }
  if (!supabaseUrl?.trim()) {
    throw new HeartbeatError('Supabase URL is required', agentId);
  }
  if (!serviceKey?.trim()) {
    throw new HeartbeatError('Service key is required', agentId);
  }

  // Create Supabase client with service role key
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // First, try to get the current requests_processed count
    const { data: existingRecord, error: fetchError } = await supabase
      .from('agent_status')
      .select('requests_processed')
      .eq('agent_id', agentId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine for new agents
      throw new HeartbeatError(
        `Failed to fetch existing agent status: ${fetchError.message}`,
        agentId,
        fetchError
      );
    }

    const currentCount = existingRecord?.requests_processed ?? 0;
    const now = new Date().toISOString();

    // Prepare the upsert payload
    const upsertPayload: Partial<AgentStatus> = {
      agent_id: agentId,
      status: 'active',
      last_request_at: now,
      requests_processed: currentCount + 1,
      updated_at: now,
    };

    // Include metadata if provided
    if (metadata !== undefined) {
      upsertPayload.metadata = metadata;
    }

    // If this is a new record, set created_at
    if (!existingRecord) {
      upsertPayload.created_at = now;
    }

    // Perform the upsert
    const { error: upsertError } = await supabase
      .from('agent_status')
      .upsert(upsertPayload, {
        onConflict: 'agent_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      throw new HeartbeatError(
        `Failed to upsert agent status: ${upsertError.message}`,
        agentId,
        upsertError
      );
    }
  } catch (error) {
    if (error instanceof HeartbeatError) {
      throw error;
    }
    throw new HeartbeatError(
      `Unexpected error during heartbeat: ${error instanceof Error ? error.message : String(error)}`,
      agentId,
      error
    );
  }
}

/**
 * Alternative version using RPC for atomic increment operation.
 * This is more reliable under high concurrency.
 */
export async function sendHeartbeatAtomic(
  agentId: string,
  supabaseUrl: string,
  serviceKey: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!agentId?.trim()) {
    throw new HeartbeatError('Agent ID is required', agentId);
  }
  if (!supabaseUrl?.trim()) {
    throw new HeartbeatError('Supabase URL is required', agentId);
  }
  if (!serviceKey?.trim()) {
    throw new HeartbeatError('Service key is required', agentId);
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { error } = await supabase.rpc('upsert_agent_heartbeat', {
      p_agent_id: agentId,
      p_metadata: metadata ?? null,
    });

    if (error) {
      throw new HeartbeatError(
        `Failed to send heartbeat via RPC: ${error.message}`,
        agentId,
        error
      );
    }
  } catch (error) {
    if (error instanceof HeartbeatError) {
      throw error;
    }
    throw new HeartbeatError(
      `Unexpected error during atomic heartbeat: ${error instanceof Error ? error.message : String(error)}`,
      agentId,
      error
    );
  }
}

// Export the error class for consumers to catch specific errors
export { HeartbeatError };
export type { AgentStatus };
```

## Database Schema

Here's the SQL to create the required table and RPC function:

```sql
-- Create the agent_status table
CREATE TABLE IF NOT EXISTS agent_status (
  agent_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'inactive' 
    CHECK (status IN ('active', 'inactive', 'error', 'starting')),
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requests_processed BIGINT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for querying active agents
CREATE INDEX IF NOT EXISTS idx_agent_status_status 
  ON agent_status(status);

CREATE INDEX IF NOT EXISTS idx_agent_status_last_request 
  ON agent_status(last_request_at);

-- RPC function for atomic heartbeat (recommended for high concurrency)
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
    p_metadata,
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
```

## Usage Examples

```typescript
import { sendHeartbeat, sendHeartbeatAtomic, HeartbeatError } from './heartbeat';

// Basic usage
async function basicExample() {
  await sendHeartbeat(
    'worker-agent-001',
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// With metadata
async function withMetadataExample() {
  await sendHeartbeat(
    'worker-agent-001',
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      version: '2.1.0',
      hostname: 'worker-node-3',
      memoryUsage: process.memoryUsage().heapUsed,
      uptime: process.uptime(),
    }
  );
}

// Periodic heartbeat with error handling
async function startHeartbeatLoop(agentId: string, intervalMs = 30000) {
  const sendPulse = async () => {
    try {
      await sendHeartbeatAtomic(
        agentId,
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { lastPulse: new Date().toISOString() }
      );
      console.log(`Heartbeat sent for ${agentId}`);
    } catch (error) {
      if (error instanceof HeartbeatError) {
        console.error(`Heartbeat failed for ${error.agentId}: ${error.message}`);
      } else {
        console.error('Unknown heartbeat error:', error);
      }
    }
  };

  // Send initial heartbeat
  await sendPulse();

  // Set up interval
  return setInterval(sendPulse, intervalMs);
}

// Usage
const heartbeatInterval = await startHeartbeatLoop('my-agent-001');

// Cleanup on shutdown
process.on('SIGTERM', () => {
  clearInterval(heartbeatInterval);
});
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Input Validation** | Validates all required parameters before making API calls |
| **Type Safety** | Full TypeScript types for all parameters and return values |
| **Atomic Operations** | Optional RPC-based version for high-concurrency scenarios |
| **Error Handling** | Custom `HeartbeatError` class with agent ID context |
| **Metadata Support** | Optional metadata field for storing agent-specific data |
| **Timestamps** | Automatic tracking of `created_at` and `updated_at` |