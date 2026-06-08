/*
  # Update agent_status check constraint

  1. Changes
    - Drop old agent_name check constraint (limited to 5 agents)
    - Add new check constraint that includes all 9 agents
    - Insert missing agent rows for growth, variant_testing, security, recruiter

  2. Notes
    - Enables the orchestrator to track all active agents
*/

ALTER TABLE agent_status DROP CONSTRAINT IF EXISTS agent_status_agent_name_check;

ALTER TABLE agent_status ADD CONSTRAINT agent_status_agent_name_check
  CHECK (agent_name = ANY (ARRAY['trading'::text, 'marketing'::text, 'support'::text, 'finance'::text, 'devops'::text, 'growth'::text, 'variant_testing'::text, 'security'::text, 'recruiter'::text, 'supervisor'::text]));

INSERT INTO agent_status (agent_name, status, uptime_seconds, requests_processed)
VALUES 
  ('growth', 'active', 0, 0),
  ('variant_testing', 'active', 0, 0),
  ('security', 'active', 0, 0),
  ('recruiter', 'active', 0, 0),
  ('supervisor', 'active', 0, 0)
ON CONFLICT (agent_name) DO NOTHING;
