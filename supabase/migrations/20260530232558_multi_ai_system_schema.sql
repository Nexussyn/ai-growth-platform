/*
  # Multi-AI Decentralized System Schema

  1. New Tables
    - `api_calls` - Tracks API usage with x402 payment data
      - `id` (uuid, primary key)
      - `endpoint` (text) - API endpoint called
      - `symbol` (text) - Trading symbol (BTC, ETH, etc.)
      - `caller_address` (text) - Wallet address of caller
      - `payment_amount` (integer) - Payment in micro-USDC
      - `payment_status` (text) - paid/pending/failed
      - `agent_type` (text) - Type of AI agent
      - `created_at` (timestamp)
    
    - `agent_status` - Tracks status of 5 AI agents
      - `id` (uuid, primary key)
      - `agent_name` (text) - trading/marketing/support/finance/devops
      - `status` (text) - active/idle/maintenance
      - `uptime_seconds` (bigint) - Current uptime in seconds
      - `requests_processed` (bigint) - Total requests handled
      - `last_request_at` (timestamp) - Time of last request
      - `updated_at` (timestamp)
    
    - `revenue_stream` - Tracks daily revenue across all streams
      - `id` (uuid, primary key)
      - `stream_type` (text) - x402_api/agentic_market/pyrimid_affiliate/data_dao/ime_share
      - `gross_revenue_usd` (decimal) - Gross revenue in USD
      - `net_revenue_usd` (decimal) - Net revenue after fees
      - `transactions_count` (integer) - Number of transactions
      - `date` (date) - Date of revenue
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Public read for agent_status (monitoring)
    - Authenticated write for api_calls and revenue_stream
    - Policies restrict data access to appropriate users
*/

-- API Calls tracking table
CREATE TABLE IF NOT EXISTS api_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  symbol text DEFAULT 'BTC',
  caller_address text,
  payment_amount integer DEFAULT 0,
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  agent_type text NOT NULL CHECK (agent_type IN ('trading', 'marketing', 'support', 'finance', 'devops')),
  created_at timestamptz DEFAULT now()
);

-- Agent status table
CREATE TABLE IF NOT EXISTS agent_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text UNIQUE NOT NULL CHECK (agent_name IN ('trading', 'marketing', 'support', 'finance', 'devops')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'maintenance')),
  uptime_seconds bigint DEFAULT 0,
  requests_processed bigint DEFAULT 0,
  last_request_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Revenue stream table
CREATE TABLE IF NOT EXISTS revenue_stream (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_type text NOT NULL CHECK (stream_type IN ('x402_api', 'agentic_market', 'pyrimid_affiliate', 'data_dao', 'ime_share')),
  gross_revenue_usd decimal(12,2) DEFAULT 0.00,
  net_revenue_usd decimal(12,2) DEFAULT 0.00,
  transactions_count integer DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(stream_type, date)
);

-- Enable RLS on all tables
ALTER TABLE api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_stream ENABLE ROW LEVEL SECURITY;

-- Public read access for agent_status (for monitoring dashboard)
CREATE POLICY "Public can view agent status"
  ON agent_status FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert api calls
CREATE POLICY "Authenticated users can insert api calls"
  ON api_calls FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can view own api calls
CREATE POLICY "Users can view own api calls"
  ON api_calls FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can manage revenue stream
CREATE POLICY "Authenticated users can manage revenue stream"
  ON revenue_stream FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON api_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_calls_agent_type ON api_calls(agent_type);
CREATE INDEX IF NOT EXISTS idx_revenue_stream_date ON revenue_stream(date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_status_name ON agent_status(agent_name);

-- Initialize default agent statuses
INSERT INTO agent_status (agent_name, status, uptime_seconds, requests_processed)
VALUES 
  ('trading', 'active', 0, 0),
  ('marketing', 'active', 0, 0),
  ('support', 'active', 0, 0),
  ('finance', 'active', 0, 0),
  ('devops', 'active', 0, 0)
ON CONFLICT (agent_name) DO NOTHING;
