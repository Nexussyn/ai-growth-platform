/*
  # API Usage Log and Revenue Acceleration Schema

  1. New Tables
    - `api_usage_log`
      - `id` (uuid, primary key)
      - `ip_hash` (text) - hashed client IP for rate limiting
      - `product` (text) - which product was called
      - `tier` (text) - 'free' or 'paid'
      - `prompt_preview` (text) - first 100 chars of the prompt
      - `response_quality` (text) - 'preview' or 'full'
      - `payment_tx` (text, nullable) - transaction hash for paid calls
      - `amount_usdc` (numeric, nullable) - amount charged
      - `created_at` (timestamptz) - when the call was made

  2. Security
    - RLS enabled with service_role only access (financial data)
    - Index on ip_hash + tier + created_at for rate limiting queries

  3. Notes
    - This table tracks all API product usage for analytics and rate limiting
    - Free tier is limited to 3 calls per day per IP
    - Paid tier logs the payment transaction for audit trail
*/

CREATE TABLE IF NOT EXISTS api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL DEFAULT '',
  product text NOT NULL DEFAULT 'ai-writer',
  tier text NOT NULL DEFAULT 'free',
  prompt_preview text DEFAULT '',
  response_quality text DEFAULT 'preview',
  payment_tx text,
  amount_usdc numeric(12,6),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to api_usage_log"
  ON api_usage_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_ratelimit
  ON api_usage_log (ip_hash, tier, created_at);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_product
  ON api_usage_log (product, created_at);
