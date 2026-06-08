// ── Payment & Revenue ─────────────────────────────────────────────────────────

export interface PaymentLedgerEntry {
  id: string;
  idempotency_key: string;
  status: string;
  amount_usdc: number;
  caller_ip_hash: string;
  tx_hash: string | null;
  destination_wallet_masked: string;
  split_pct_payout: number;
  payout_usdc: number;
  reserve_usdc: number;
  received_at: string | null;
  validated_at: string | null;
  pending_at: string | null;
  confirmed_at: string | null;
  settled_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  correlation_id: string;
  created_at: string;
}

export interface RevenueSummary {
  settled_gross_usdc: number;
  settled_payout_usdc: number;
  settled_reserve_usdc: number;
  settled_count: number;
  pending_usdc: number;
  pending_count: number;
  failed_usdc: number;
  failed_count: number;
  split_pct_payout: number;
  split_pct_reserve: number;
  by_stream: LedgerStreamRow[];
}

export interface LedgerStreamRow {
  id: string;
  status: string;
  amount: number;
  payout: number;
  reserve: number;
  tx_hash: string | null;
  settled_at: string | null;
  created_at: string;
  correlation_id: string;
}

// ── System Metrics ────────────────────────────────────────────────────────────

export interface SystemMetrics {
  id: string;
  paid_calls: number;
  total_gross_usdc: string;
  total_payout_usdc: string;
  total_reserve_usdc: string;
  last_payment_at: string | null;
  updated_at: string;
}

// ── Dashboard State ──────────────────────────────────────────────────────────

export interface DashboardState {
  revenue: RevenueSummary;
  growth_phases: GrowthPhase[];
  diversification: DiversificationPhase[];
  variants: ExperimentVariant[];
  health_checks: HealthCheck[];
  reconciliation: ReconciliationEntry[];
  channels: ChannelPerformance[];
  recent_agent_runs: AgentRunEntry[];
  improvement?: ImprovementState;
  wallet_configured: boolean;
  version: string;
}

// ── Improvement Engine ───────────────────────────────────────────────────────

export interface ImprovementState {
  proposals: ImprovementProposal[];
  signals: UpdateIntelligence[];
  roadmap: RoadmapItem[];
  last_cycle: ImprovementCycle | null;
  memory: ImprovementMemoryEntry[];
  engine_state: 'learning' | 'testing' | 'promoting';
}

export interface ImprovementProposal {
  id: string;
  proposal_id: string;
  source: string;
  source_agent: string;
  category: string;
  title: string;
  rationale: string;
  expected_impact: Record<string, number>;
  confidence: number;
  risk: string;
  implementation_cost: string;
  compatibility_score: number;
  testability: string;
  status: string;
  experiment_id: string | null;
  result_data: Record<string, unknown>;
  decision: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface UpdateIntelligence {
  id: string;
  signal_type: string;
  source_url: string;
  summary: string;
  relevance_score: number;
  mapped_to: string;
  proposed_changes: Record<string, unknown>;
  estimated_impact: Record<string, unknown>;
  status: string;
  proposal_id: string | null;
  created_at: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  category: string;
  expected_value_score: number;
  experiment_spec: Record<string, unknown>;
  status: string;
  priority: number;
  created_at: string;
}

export interface ImprovementCycle {
  id: string;
  cycle_number: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  performance_snapshot: Record<string, unknown>;
  proposals_generated: number;
  experiments_started: number;
  promotions: number;
  rejections: number;
  summary: Record<string, unknown>;
}

export interface ImprovementMemoryEntry {
  id: string;
  memory_type: string;
  category: string;
  title: string;
  content: Record<string, unknown>;
  outcome: Record<string, unknown>;
  version: number;
  is_active: boolean;
  created_at: string;
}

// ── Growth & Diversification ─────────────────────────────────────────────────

export interface GrowthPhase {
  id: string;
  phase_number: number;
  phase_name: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
  entry_threshold: Record<string, number>;
  metrics_at_entry: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface DiversificationPhase {
  id: string;
  dimension: string;
  status: 'exploring' | 'scaling' | 'mature';
  active_variants_count: number;
  allocated_traffic_pct: number;
  metrics: Record<string, unknown>;
}

// ── Experiment Variants ──────────────────────────────────────────────────────

export interface ExperimentVariant {
  id: string;
  variant_key: string;
  title: string;
  description: string;
  cta: string;
  impressions: number;
  clicks: number;
  conversions: number;
  confirmed_revenue_usdc: number;
  ctr: number;
  cvr: number;
  rpv: number;
  status: string;
  phase: string;
  audience_segment: string;
  channel: string;
  created_at: string;
  promoted_at: string | null;
  retired_at: string | null;
}

// ── Agent System ─────────────────────────────────────────────────────────────

export interface AgentRunEntry {
  agent_name: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  output_data: Record<string, unknown>;
}

export interface AgentStatus {
  id: string;
  agent_name: string;
  status: 'active' | 'idle' | 'maintenance';
  uptime_seconds: number;
  requests_processed: number;
  last_request_at: string | null;
  updated_at: string;
}

// ── Health & Reconciliation ──────────────────────────────────────────────────

export interface HealthCheck {
  id: string;
  component: string;
  status: 'healthy' | 'degraded' | 'down';
  details: Record<string, unknown> | null;
  checked_at: string;
}

export interface ReconciliationEntry {
  id: string;
  run_at: string;
  ledger_total_usdc: number;
  settled_total_usdc: number;
  payout_total_usdc: number;
  reserve_total_usdc: number;
  displayed_total_usdc: number;
  discrepancy_usdc: number;
  status: 'clean' | 'discrepancy_found' | 'resolved';
  details: Record<string, unknown>;
}

// ── Channel Performance ──────────────────────────────────────────────────────

export interface ChannelPerformance {
  id: string;
  channel_name: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue_usdc: number;
  cost_usdc: number;
  roi_score: number;
  date: string;
}

// ── Referral & Viral ─────────────────────────────────────────────────────────

export interface ReferralData {
  referral_active: boolean;
  commission_pct: number;
  network: string;
  currency: string;
  share_texts: string[];
  hashtags: string[];
}

export interface ViralData {
  share_texts: string[];
}

// ── Wallet ───────────────────────────────────────────────────────────────────

export interface WalletConfig {
  id: string;
  configured: boolean;
  masked_address: string;
  network: string;
  currency: string;
  updated_at: string;
}

export interface WalletStatus {
  configured: boolean;
  masked_address: string;
  network: string;
  currency: string;
  price_per_call: string;
  setup_instruction: string;
  split: { payout_pct: number; reserve_pct: number };
}

// ── Autonomous Scheduler ────────────────────────────────────────────────────

export interface SchedulerStatus {
  orchestrator: {
    current_phase: string;
    phase_entered_at: string;
    total_ticks: number;
    last_tick_at: string | null;
    watchdog_healthy: boolean;
    watchdog_last_ping: string | null;
  };
  scheduled_jobs: ScheduledJob[];
  recent_runs: JobRun[];
  failed_runs: JobRun[];
  active_runs: JobRun[];
  pending_promotions: CanaryRoute[];
  recent_promotions: PromotionEntry[];
}

export interface ScheduledJob {
  id: string;
  job_name: string;
  cron_expression: string;
  enabled: boolean;
  max_retries: number;
  timeout_ms: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface JobRun {
  id: string;
  run_id: string;
  job_name: string;
  phase: string | null;
  status: string;
  attempt: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metrics_delta: Record<string, unknown>;
  promotion_decision: string | null;
  output_data: Record<string, unknown>;
  created_at: string;
}

export interface CanaryRoute {
  id: string;
  target_type: string;
  target_id: string;
  traffic_pct: number;
  status: string;
  started_at: string;
  promoted_at: string | null;
  rolled_back_at: string | null;
  metrics: Record<string, unknown>;
  created_at: string;
}

export interface PromotionEntry {
  id: string;
  variant_id: string;
  decision: string;
  reason: string | null;
  baseline_rpv: number;
  candidate_rpv: number;
  revenue_lift_pct: number;
  conversion_lift_pct: number;
  settlement_integrity: boolean;
  error_rate: number;
  gating_passed: boolean;
  created_at: string;
}

// ── Security & Governance ───────────────────────────────────────────────────

export interface SecurityStatus {
  overall_status: 'critical' | 'warnings' | 'secure';
  findings: SecurityFinding[];
  open_findings_count: number;
  critical_count: number;
  blocks_promotion_count: number;
  violations: PolicyViolation[];
  agents: AgentRegistryEntry[];
  quarantined_agents: AgentRegistryEntry[];
  policies: GovernancePolicy[];
  rls_enforced: boolean;
  secrets_exposed: boolean;
  edge_boundary_intact: boolean;
}

export interface SecurityFinding {
  id: string;
  finding_type: string;
  severity: string;
  component: string;
  description: string;
  remediation: string | null;
  status: string;
  verified_at: string | null;
  blocks_promotion: boolean;
  scan_run_id: string | null;
  created_at: string;
}

export interface PolicyViolation {
  id: string;
  agent_id: string;
  violation_type: string;
  severity: string;
  details: Record<string, unknown>;
  action_taken: string;
  created_at: string;
}

export interface AgentRegistryEntry {
  id: string;
  agent_id: string;
  role: string;
  status: string;
  permissions: Record<string, unknown>;
  allowed_tools: string[];
  allowed_tables_read: string[];
  allowed_tables_write: string[];
  write_scope: Record<string, unknown>;
  timeout_ms: number;
  max_retries: number;
  failure_escalation: string;
  created_by: string;
  approved_by: string | null;
  onboarding_status: string;
  last_run_at: string | null;
  health_status: string;
  security_score: number;
  performance_score: number;
  created_at: string;
  updated_at: string;
}

export interface GovernancePolicy {
  id: string;
  policy_name: string;
  policy_type: string;
  applies_to: string;
  conditions: Record<string, unknown>;
  effect: string;
  priority: number;
  enabled: boolean;
  created_at: string;
}

// ── Recruitment ─────────────────────────────────────────────────────────────

export interface RecruitmentStatus {
  pipeline: Record<string, RecruitmentCandidate[]>;
  candidates: RecruitmentCandidate[];
  active_agents: Array<{ agent_id: string; role: string; status: string; security_score: number; performance_score: number }>;
  sandbox_agents: Array<{ agent_id: string; role: string; status: string; security_score: number }>;
  total_candidates: number;
  pipeline_summary: Record<string, number>;
}

export interface RecruitmentCandidate {
  id: string;
  candidate_id: string;
  source: string;
  source_url: string;
  role: string;
  capability_description: string;
  capability_fit_score: number;
  security_risk_score: number;
  expected_value_score: number;
  proposed_tools: string[];
  proposed_data_scope: string[];
  proposed_write_scope: string[];
  evaluation_rationale: string | null;
  pipeline_stage: string;
  rejection_reason: string | null;
  sandbox_result: Record<string, unknown>;
  onboarding_plan: Record<string, unknown>;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Queue & Expansion ──────────────────────────────────────────────────────

export interface QueueStatus {
  pending: number;
  running: number;
  dead_letter: number;
  completed: number;
  dead_letter_items: Array<{ id: string; job_type: string; error_message: string | null; created_at: string }>;
}

export interface SecurityGatesStatus {
  open_gates: SecurityGate[];
  resolved_gates: SecurityGate[];
  blocks_promotion: boolean;
  blocks_expansion: boolean;
  blocks_deployment: boolean;
  summary: { critical: number; high: number; medium: number };
}

export interface SecurityGate {
  id: string;
  gate_type: string;
  severity: string;
  description: string;
  blocks: string[];
  status: string;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface ExpansionStatus {
  recent_actions: ExpansionAction[];
  active_variants: number;
  testing_variants: number;
  actions_last_24h: number;
  channels_active: number;
  dimensions_covered: string[];
}

export interface ExpansionAction {
  id: string;
  action_type: string;
  dimension: string;
  details: Record<string, unknown>;
  triggered_by: string;
  status: string;
  created_at: string;
}

// ── Autonomous Engine State ─────────────────────────────────────────────────

export interface EngineStateData {
  id: string;
  mode: 'learning' | 'testing' | 'recruiting' | 'promoting' | 'expanding' | 'settling' | 'reconciling' | 'degraded';
  submode: string | null;
  started_at: string;
  last_heartbeat_at: string;
  components_status: Record<string, string>;
  degraded_components: string[];
  active_since: string;
  total_autonomous_hours: number;
  total_revenue_usdc: number;
  decisions_made: number;
  expansions_completed: number;
  agents_recruited: number;
  recent_jobs: Array<{ job_name: string; status: string; duration_ms: number | null; created_at: string }>;
  recent_expansions: Array<{ action_type: string; dimension: string; status: string; created_at: string }>;
  uptime_hours: number;
  wallet_configured: boolean;
  version: string;
}

export interface WalletProviderData {
  id: string;
  provider_id: string;
  provider_name: string;
  chain_support: string[];
  payment_support: string[];
  mobile_support: boolean;
  desktop_support: boolean;
  fallback_order: number;
  status: string;
  detection_method: string;
  install_url: string;
}

export interface ViralArtifact {
  id: string;
  artifact_type: string;
  trigger_event: string;
  content: Record<string, unknown>;
  share_url: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  status: string;
  created_at: string;
}

export interface ViralLoop {
  id: string;
  loop_type: string;
  status: string;
  trigger_condition: Record<string, unknown>;
  content_template: Record<string, unknown>;
  metrics: { impressions?: number; shares?: number; conversions?: number };
  conversion_rate: number;
  revenue_attributed_usdc: number;
  last_triggered_at: string | null;
}

// ── Blue/Green Deployment & Profit ──────────────────────────────────────────

export interface DeploymentStatus {
  current_version: string;
  blue: DeploymentVersion | null;
  green: DeploymentVersion | null;
  versions: DeploymentVersion[];
  recent_mutations: MutationEntry[];
  immutable_wallet: string;
  immutable_wallet_configured: boolean;
}

export interface DeploymentVersion {
  id: string;
  version_tag: string;
  slot: string;
  status: string;
  traffic_pct: number;
  deployed_at: string;
  validated_at: string | null;
  promoted_at: string | null;
  rolled_back_at: string | null;
  validation_results: Record<string, unknown>;
}

export interface MutationEntry {
  id: string;
  mutation_type: string;
  target: string;
  before_value: Record<string, unknown>;
  after_value: Record<string, unknown>;
  initiated_by: string;
  validation_status: string;
  slot: string;
  created_at: string;
}

export interface ProfitSummary {
  periods: ProfitPeriod[];
  totals: {
    net_profit_usdc: number;
    gross_revenue_usdc: number;
    fees_usdc: number;
    settlements_count: number;
    failed_count: number;
  };
  settlement_wallet: string;
  settlement_wallet_configured: boolean;
}

export interface ProfitPeriod {
  id: string;
  period: string;
  gross_revenue_usdc: number;
  fees_usdc: number;
  net_profit_usdc: number;
  settlements_count: number;
  failed_count: number;
  refunds_usdc: number;
  growth_reinvest_usdc: number;
  owner_payout_usdc: number;
  computed_at: string;
}

export interface GrowthBlockersData {
  open_blockers: GrowthBlocker[];
  recently_resolved: GrowthBlocker[];
  total_impact_usdc: number;
  count: number;
}

export interface GrowthBlocker {
  id: string;
  blocker_type: string;
  severity: string;
  description: string;
  impact_estimate_usdc: number;
  resolution_action: string;
  status: string;
  detected_at: string;
  resolved_at: string | null;
}

// ── Legacy compat ────────────────────────────────────────────────────────────

export interface LoopStatus {
  iterations: number;
  best_variant: Variant | null;
  variants: Variant[];
  metrics: { views: number; clicks: number; paid_calls: number | null; revenue_usdc: null };
}

export interface Variant {
  id: string;
  title: string;
  description: string;
  cta: string;
  click_through_rate: number;
  conversion_rate: number;
  revenue_per_view: number;
  share_score: number;
  status?: string;
  roi_label?: string;
}

export interface HealthStatus {
  status: string;
  autonomy: boolean;
  decentralized: boolean;
  wallet_configured: boolean;
}

export interface RevenueStream {
  id: string;
  stream_type: string;
  gross_revenue_usd: string;
  net_revenue_usd: string;
  growth_reserve_usd: string;
  payout_amount_usd: string;
  destination_wallet_masked: string;
  split_pct_payout: number;
  transactions_count: number;
  date: string;
  payment_status: 'pending' | 'confirmed' | 'failed';
  tx_hash: string | null;
  payment_id: string;
  settled_at: string | null;
  caller_ip_hash: string;
  created_at: string;
}

export interface ApiCall {
  id: string;
  endpoint: string;
  symbol: string;
  caller_address: string | null;
  payment_amount: number;
  payment_status: string;
  agent_type: string;
  created_at: string;
}

export interface MarketingSummary {
  headline: string;
  value_proposition: string;
  share_text: string;
  hashtags: string[];
}

// ── Payment State ────────────────────────────────────────────────────────────

export type PaymentState =
  | 'idle'
  | 'connecting_wallet'
  | 'wallet_connected'
  | 'submitting'
  | 'success'
  | 'error'
  | 'no_wallet'
  | 'wallet_missing';

export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

// ── Monetization ────────────────────────────────────────────────────────────

export interface MonetizationSummary {
  plans: PricingPlan[];
  active_subscriptions: number;
  usage_24h_credits: number;
  pending_overages_usdc: number;
  referral_rewards_issued: number;
  latest_profit_snapshot: NetProfitSnapshot | null;
}

export interface PricingPlan {
  id: string;
  plan_key: string;
  name: string;
  price_usdc_monthly: number;
  price_usdc_annual: number;
  included_credits: number;
  overage_rate_usdc: number;
  features: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

export interface NetProfitSnapshot {
  period_start: string;
  period_end: string;
  gross_revenue_usdc: number;
  confirmed_revenue_usdc: number;
  pending_revenue_usdc: number;
  payment_fees_usdc: number;
  inference_cost_usdc: number;
  infra_cost_usdc: number;
  referral_rewards_usdc: number;
  net_profit_usdc: number;
  visitors: number;
  activations: number;
  conversions: number;
  revenue_per_visitor: number;
}

// ── Orchestrator Live & Agent Communication ─────────────────────────────────

export interface OrchestratorHeartbeat {
  id: string;
  tick_number: number;
  started_at: string;
  finished_at: string | null;
  last_action: string;
  last_error: string;
  progress_percent: number;
  queue_depth: number;
  completed_jobs: number;
  failed_jobs: number;
  stalled_jobs: number;
  stalled_for_seconds: number;
  active_phase: string;
  active_repairs: number;
  created_at: string;
}

export interface OrchestratorLiveData {
  state: Record<string, unknown>;
  heartbeats: OrchestratorHeartbeat[];
  pending_repairs: Array<{ id: string; failure_family: string; status: string; priority: number }>;
  recent_jobs: Array<{ job_name: string; status: string; started_at: string; finished_at: string | null; result: unknown }>;
}

export interface AgentMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  message_type: string;
  subject: string;
  body: Record<string, unknown>;
  priority: string;
  read_at: string | null;
  created_at: string;
}

export interface AgentTask {
  id: string;
  agent_id: string;
  task_type: string;
  description: string;
  status: string;
  priority: number;
  input: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  error: string;
  created_at: string;
}

export interface AgentEvent {
  id: string;
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AgentStat {
  total: number;
  completed: number;
  failed: number;
  running: number;
  cost: number;
  revenue: number;
  avg_duration: number;
}
