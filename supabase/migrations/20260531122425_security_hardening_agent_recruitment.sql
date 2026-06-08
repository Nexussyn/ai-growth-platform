/*
  # Security Hardening & Agent Recruitment Layer

  1. New Tables
    - `agent_registry` - Central registry of all agents with permissions
      - `id` (uuid, primary key)
      - `agent_id` (text, unique) - slug identifier
      - `role` (text) - agent's declared role
      - `status` (text) - active/sandbox/quarantined/retired/candidate
      - `permissions` (jsonb) - structured permission object
      - `allowed_tools` (text[]) - tool allowlist
      - `allowed_tables_read` (text[]) - tables agent can SELECT
      - `allowed_tables_write` (text[]) - tables agent can INSERT/UPDATE
      - `write_scope` (jsonb) - granular write conditions
      - `timeout_ms` (int) - hard execution timeout
      - `max_retries` (int) - retry policy
      - `failure_escalation` (text) - where failures go
      - `created_by` (text) - who/what created it
      - `approved_by` (text) - who approved activation
      - `onboarding_status` (text) - discovered/inspecting/sandbox/approved/active
      - `last_run_at` (timestamptz)
      - `health_status` (text) - healthy/degraded/quarantined
      - `security_score` (numeric) - 0-100
      - `performance_score` (numeric) - 0-100
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `security_findings` - Findings from security agent scans
      - `id` (uuid, primary key)
      - `finding_type` (text) - rls_missing/secret_exposed/permissive_policy/unsafe_endpoint/scope_violation
      - `severity` (text) - critical/high/medium/low/info
      - `component` (text) - what component is affected
      - `description` (text) - human-readable description
      - `remediation` (text) - steps to fix
      - `status` (text) - open/mitigated/resolved/accepted
      - `verified_at` (timestamptz) - when it was verified fixed
      - `blocks_promotion` (boolean) - whether this blocks agent promotion
      - `scan_run_id` (text) - which scan found it
      - `created_at` (timestamptz)

    - `recruitment_candidates` - Agent candidates discovered by recruiter
      - `id` (uuid, primary key)
      - `candidate_id` (text, unique) - stable identifier
      - `source` (text) - where found (web/template/internal)
      - `source_url` (text)
      - `role` (text) - proposed role
      - `capability_description` (text)
      - `capability_fit_score` (numeric) - 0-100
      - `security_risk_score` (numeric) - 0-100 (higher=riskier)
      - `expected_value_score` (numeric) - 0-100
      - `proposed_tools` (text[])
      - `proposed_data_scope` (text[])
      - `proposed_write_scope` (text[])
      - `evaluation_rationale` (text)
      - `pipeline_stage` (text) - discovered/inspecting/evaluated/approved/sandbox/active/rejected
      - `rejection_reason` (text)
      - `sandbox_result` (jsonb)
      - `onboarding_plan` (jsonb)
      - `approved_by` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `agent_policy_violations` - Policy violations detected
      - `id` (uuid, primary key)
      - `agent_id` (text) - which agent violated
      - `violation_type` (text) - scope_exceeded/unauthorized_write/tool_misuse/injection_attempt/unauthorized_expansion
      - `severity` (text) - critical/high/medium/low
      - `details` (jsonb) - what happened
      - `action_taken` (text) - blocked/quarantined/warned/escalated
      - `created_at` (timestamptz)

    - `agent_governance_policies` - Policy rules governing agent behavior
      - `id` (uuid, primary key)
      - `policy_name` (text, unique)
      - `policy_type` (text) - data_access/tool_access/write_access/approval_required/human_override
      - `applies_to` (text) - agent_id or '*' for all
      - `conditions` (jsonb) - when the policy applies
      - `effect` (text) - allow/deny/require_approval
      - `priority` (int) - higher priority overrides lower
      - `enabled` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Service role only access (system internals)

  3. Notes
    - security_findings.blocks_promotion prevents unsafe agent activations
    - agent_registry enforces least-privilege via allowed_tools and allowed_tables
    - recruitment_candidates tracks full pipeline from discovery to activation
*/

-- Agent Registry
CREATE TABLE IF NOT EXISTS agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text UNIQUE NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'candidate',
  permissions jsonb DEFAULT '{}',
  allowed_tools text[] DEFAULT ARRAY[]::text[],
  allowed_tables_read text[] DEFAULT ARRAY[]::text[],
  allowed_tables_write text[] DEFAULT ARRAY[]::text[],
  write_scope jsonb DEFAULT '{}',
  timeout_ms int DEFAULT 30000,
  max_retries int DEFAULT 3,
  failure_escalation text DEFAULT 'supervisor',
  created_by text NOT NULL DEFAULT 'system',
  approved_by text,
  onboarding_status text DEFAULT 'active',
  last_run_at timestamptz,
  health_status text DEFAULT 'healthy',
  security_score numeric DEFAULT 100,
  performance_score numeric DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent_registry"
  ON agent_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_registry_status ON agent_registry(status);

-- Seed core agents
INSERT INTO agent_registry (agent_id, role, status, allowed_tools, allowed_tables_read, allowed_tables_write, created_by, approved_by, onboarding_status, security_score) VALUES
  ('supervisor', 'orchestration', 'active', ARRAY['run_agent', 'read_state', 'write_decision', 'transition_phase'], ARRAY['system_metrics', 'growth_phases', 'reconciliation_status', 'agent_runs', 'orchestrator_state'], ARRAY['agent_runs', 'agent_decisions', 'growth_phases', 'orchestrator_state'], 'system', 'system', 'active', 100),
  ('finance', 'reconciliation', 'active', ARRAY['read_ledger', 'write_reconciliation', 'mark_stale'], ARRAY['payment_ledger', 'system_metrics', 'revenue_stream', 'reconciliation_status'], ARRAY['reconciliation_status', 'payment_ledger'], 'system', 'system', 'active', 100),
  ('marketing', 'variant_generation', 'active', ARRAY['read_variants', 'write_variant', 'evaluate_performance'], ARRAY['experiment_variants', 'system_metrics'], ARRAY['experiment_variants'], 'system', 'system', 'active', 100),
  ('growth', 'distribution', 'active', ARRAY['read_channels', 'write_diversification', 'read_referrals'], ARRAY['experiment_variants', 'viral_shares', 'referral_events', 'diversification_phases'], ARRAY['diversification_phases', 'channel_performance'], 'system', 'system', 'active', 100),
  ('variant_testing', 'experimentation', 'active', ARRAY['read_variants', 'promote_variant', 'retire_variant'], ARRAY['experiment_variants', 'promotion_log'], ARRAY['experiment_variants', 'promotion_log'], 'system', 'system', 'active', 100),
  ('devops', 'health_monitoring', 'active', ARRAY['check_health', 'write_health'], ARRAY['health_checks', 'system_metrics'], ARRAY['health_checks'], 'system', 'system', 'active', 100),
  ('support', 'audit', 'active', ARRAY['read_failures', 'read_reconciliation'], ARRAY['payment_ledger', 'reconciliation_status'], ARRAY[]::text[], 'system', 'system', 'active', 100),
  ('security', 'security_scanning', 'active', ARRAY['scan_tables', 'scan_policies', 'scan_endpoints', 'write_findings', 'quarantine_agent'], ARRAY['agent_registry', 'security_findings', 'agent_policy_violations', 'agent_governance_policies'], ARRAY['security_findings', 'agent_policy_violations', 'agent_registry'], 'system', 'system', 'active', 100),
  ('recruiter', 'agent_recruitment', 'active', ARRAY['search_candidates', 'evaluate_candidate', 'propose_onboarding', 'read_registry'], ARRAY['agent_registry', 'recruitment_candidates', 'security_findings'], ARRAY['recruitment_candidates'], 'system', 'system', 'active', 100)
ON CONFLICT (agent_id) DO NOTHING;

-- Security Findings
CREATE TABLE IF NOT EXISTS security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  component text NOT NULL,
  description text NOT NULL,
  remediation text,
  status text NOT NULL DEFAULT 'open',
  verified_at timestamptz,
  blocks_promotion boolean DEFAULT false,
  scan_run_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE security_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages security_findings"
  ON security_findings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_security_findings_status ON security_findings(status);
CREATE INDEX IF NOT EXISTS idx_security_findings_severity ON security_findings(severity);

-- Recruitment Candidates
CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id text UNIQUE NOT NULL,
  source text NOT NULL DEFAULT 'internal',
  source_url text DEFAULT '',
  role text NOT NULL,
  capability_description text NOT NULL,
  capability_fit_score numeric DEFAULT 0,
  security_risk_score numeric DEFAULT 50,
  expected_value_score numeric DEFAULT 0,
  proposed_tools text[] DEFAULT ARRAY[]::text[],
  proposed_data_scope text[] DEFAULT ARRAY[]::text[],
  proposed_write_scope text[] DEFAULT ARRAY[]::text[],
  evaluation_rationale text,
  pipeline_stage text NOT NULL DEFAULT 'discovered',
  rejection_reason text,
  sandbox_result jsonb DEFAULT '{}',
  onboarding_plan jsonb DEFAULT '{}',
  approved_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE recruitment_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages recruitment_candidates"
  ON recruitment_candidates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_recruitment_stage ON recruitment_candidates(pipeline_stage);

-- Agent Policy Violations
CREATE TABLE IF NOT EXISTS agent_policy_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  violation_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  details jsonb DEFAULT '{}',
  action_taken text NOT NULL DEFAULT 'blocked',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_policy_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent_policy_violations"
  ON agent_policy_violations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_violations_agent ON agent_policy_violations(agent_id);

-- Agent Governance Policies
CREATE TABLE IF NOT EXISTS agent_governance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text UNIQUE NOT NULL,
  policy_type text NOT NULL,
  applies_to text NOT NULL DEFAULT '*',
  conditions jsonb DEFAULT '{}',
  effect text NOT NULL DEFAULT 'deny',
  priority int DEFAULT 0,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_governance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages agent_governance_policies"
  ON agent_governance_policies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed default governance policies
INSERT INTO agent_governance_policies (policy_name, policy_type, applies_to, conditions, effect, priority) VALUES
  ('deny_all_default', 'data_access', '*', '{}', 'deny', 0),
  ('allow_registered_reads', 'data_access', '*', '{"requires": "table_in_allowed_tables_read"}', 'allow', 10),
  ('allow_registered_writes', 'write_access', '*', '{"requires": "table_in_allowed_tables_write"}', 'allow', 10),
  ('allow_registered_tools', 'tool_access', '*', '{"requires": "tool_in_allowed_tools"}', 'allow', 10),
  ('block_unregistered_agents', 'tool_access', '*', '{"requires": "agent_status_active"}', 'deny', 100),
  ('require_approval_for_deployment', 'approval_required', '*', '{"action": "deploy_agent"}', 'require_approval', 50),
  ('require_approval_for_expansion', 'approval_required', '*', '{"action": "expand_permissions"}', 'require_approval', 50),
  ('human_override_quarantine', 'human_override', '*', '{"action": "unquarantine"}', 'require_approval', 100),
  ('block_scope_exceeded', 'write_access', '*', '{"check": "within_write_scope"}', 'deny', 90),
  ('sandbox_only_candidates', 'tool_access', '*', '{"requires": "status_not_candidate", "unless": "in_sandbox"}', 'deny', 80)
ON CONFLICT (policy_name) DO NOTHING;
