/*
  # Agent Communication Bus & Orchestrator Heartbeats

  1. New Tables
    - `orchestrator_heartbeats`
      - `id` (uuid, primary key)
      - `tick_number` (integer) - monotonically increasing tick count
      - `started_at` (timestamptz) - when the tick started
      - `finished_at` (timestamptz) - when the tick finished
      - `last_action` (text) - description of last action taken
      - `last_error` (text) - last error encountered if any
      - `progress_percent` (numeric) - current progress 0-100
      - `queue_depth` (integer) - jobs remaining in queue
      - `completed_jobs` (integer) - jobs completed this tick
      - `failed_jobs` (integer) - jobs failed this tick
      - `stalled_jobs` (integer) - jobs detected as stalled
      - `stalled_for_seconds` (integer) - time since last mutation
      - `active_phase` (text) - current growth phase
      - `active_repairs` (integer) - repair tasks in progress
      - `created_at` (timestamptz)

    - `agent_messages`
      - `id` (uuid, primary key)
      - `from_agent` (text) - sender agent id
      - `to_agent` (text) - recipient agent id
      - `message_type` (text) - task_assignment, result, status_update, alert, request
      - `subject` (text) - short summary
      - `body` (jsonb) - message payload
      - `priority` (text) - low, normal, high, critical
      - `read_at` (timestamptz) - when recipient read it
      - `created_at` (timestamptz)

    - `agent_events`
      - `id` (uuid, primary key)
      - `agent_id` (text) - which agent emitted
      - `event_type` (text) - state_change, task_start, task_complete, task_fail, error, heartbeat
      - `payload` (jsonb) - event data
      - `created_at` (timestamptz)

    - `agent_tasks`
      - `id` (uuid, primary key)
      - `agent_id` (text) - assigned agent
      - `task_type` (text) - category of task
      - `description` (text) - what needs to be done
      - `status` (text) - queued, running, completed, failed
      - `priority` (integer) - 1-10
      - `input` (jsonb) - task input data
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `error` (text) - failure reason if failed
      - `created_at` (timestamptz)

    - `agent_results`
      - `id` (uuid, primary key)
      - `task_id` (uuid, references agent_tasks)
      - `agent_id` (text)
      - `output` (jsonb) - result data
      - `cost_credits` (numeric) - credits consumed
      - `revenue_attributed` (numeric) - revenue generated
      - `duration_ms` (integer) - execution time
      - `created_at` (timestamptz)

    - `workflow_snapshots`
      - `id` (uuid, primary key)
      - `snapshot_type` (text) - pre_repair, post_repair, checkpoint, rollback_target
      - `target_table` (text) - which table was snapshotted
      - `target_id` (text) - row id
      - `state_before` (jsonb) - state at snapshot time
      - `state_after` (jsonb) - state after change (for post_repair)
      - `repair_id` (uuid) - linked repair_queue entry
      - `valid` (boolean) - whether this snapshot is usable
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all new tables
    - Service role only write access
    - Authenticated users can read agent_messages and agent_events for dashboard display
*/

-- orchestrator_heartbeats
CREATE TABLE IF NOT EXISTS orchestrator_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tick_number integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  last_action text DEFAULT '',
  last_error text DEFAULT '',
  progress_percent numeric DEFAULT 0,
  queue_depth integer DEFAULT 0,
  completed_jobs integer DEFAULT 0,
  failed_jobs integer DEFAULT 0,
  stalled_jobs integer DEFAULT 0,
  stalled_for_seconds integer DEFAULT 0,
  active_phase text DEFAULT 'stabilize',
  active_repairs integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orchestrator_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages orchestrator heartbeats"
  ON orchestrator_heartbeats FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can read orchestrator heartbeats"
  ON orchestrator_heartbeats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read orchestrator heartbeats"
  ON orchestrator_heartbeats FOR SELECT
  TO anon
  USING (true);

-- agent_messages
CREATE TABLE IF NOT EXISTS agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent text NOT NULL DEFAULT '',
  to_agent text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'status_update',
  subject text NOT NULL DEFAULT '',
  body jsonb DEFAULT '{}',
  priority text DEFAULT 'normal',
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent messages"
  ON agent_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read agent messages"
  ON agent_messages FOR SELECT
  TO anon
  USING (true);

-- agent_events
CREATE TABLE IF NOT EXISTS agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'heartbeat',
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent events"
  ON agent_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read agent events"
  ON agent_events FOR SELECT
  TO anon
  USING (true);

-- agent_tasks
CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL DEFAULT '',
  task_type text NOT NULL DEFAULT 'general',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',
  priority integer DEFAULT 5,
  input jsonb DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  error text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent tasks"
  ON agent_tasks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read agent tasks"
  ON agent_tasks FOR SELECT
  TO anon
  USING (true);

-- agent_results
CREATE TABLE IF NOT EXISTS agent_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES agent_tasks(id),
  agent_id text NOT NULL DEFAULT '',
  output jsonb DEFAULT '{}',
  cost_credits numeric DEFAULT 0,
  revenue_attributed numeric DEFAULT 0,
  duration_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent results"
  ON agent_results FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read agent results"
  ON agent_results FOR SELECT
  TO anon
  USING (true);

-- workflow_snapshots
CREATE TABLE IF NOT EXISTS workflow_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type text NOT NULL DEFAULT 'checkpoint',
  target_table text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  state_before jsonb DEFAULT '{}',
  state_after jsonb DEFAULT '{}',
  repair_id uuid,
  valid boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workflow_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages workflow snapshots"
  ON workflow_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read workflow snapshots"
  ON workflow_snapshots FOR SELECT
  TO anon
  USING (true);

-- Add indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_heartbeats_created ON orchestrator_heartbeats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent, read_at);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_results_task ON agent_results(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_snapshots_repair ON workflow_snapshots(repair_id);

-- Add columns to orchestrator_state for enhanced tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestrator_state' AND column_name = 'last_action') THEN
    ALTER TABLE orchestrator_state ADD COLUMN last_action text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestrator_state' AND column_name = 'last_error') THEN
    ALTER TABLE orchestrator_state ADD COLUMN last_error text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestrator_state' AND column_name = 'progress_percent') THEN
    ALTER TABLE orchestrator_state ADD COLUMN progress_percent numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestrator_state' AND column_name = 'stalled_for_seconds') THEN
    ALTER TABLE orchestrator_state ADD COLUMN stalled_for_seconds integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestrator_state' AND column_name = 'queue_depth') THEN
    ALTER TABLE orchestrator_state ADD COLUMN queue_depth integer DEFAULT 0;
  END IF;
END $$;
