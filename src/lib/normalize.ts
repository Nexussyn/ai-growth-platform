export type CanonicalSnapshot = {
  counts: {
    impressions: number;
    clicks: number;
    iterations: number;
    subscriptions: number;
    usage_credits: number;
    referral_rewards: number;
    canonical_routes_tracked: number;
    canonical_approvals_recorded: number;
    connectors_registered: number;
    coherence_violations_detected: number;
    coherence_violations_resolved: number;
    open_violations: number;
  };
  flags: {
    live_connection: boolean;
    wallet_configured: boolean;
    preview_ready: boolean;
    scheduler_active: boolean;
    coherence_ok: boolean;
  };
  lists: {
    routes: CanonicalRoute[];
    approvals: CanonicalApproval[];
    connectors: CanonicalConnector[];
    health: CanonicalHealth[];
    events: CanonicalEvent[];
    evidence: CanonicalEvidence[];
    jobs: CanonicalJob[];
    violations: CanonicalViolation[];
  };
  strings: {
    status: string;
    message: string;
    error: string;
  };
  generated_at: string;
};

export type CanonicalRoute = {
  route_key: string;
  route_kind: string;
  status: string;
  last_verified_at: string;
  last_error: string;
  consecutive_failures: number;
};

export type CanonicalApproval = {
  task_id: string;
  state: string;
  approved_by: string;
  blocked_by: string;
  block_reason: string;
  updated_at: string;
};

export type CanonicalConnector = {
  connector_key: string;
  connector_kind: string;
  auth_method: string;
  free_first: boolean;
  status: string;
  timeout_ms: number;
};

export type CanonicalHealth = {
  subject_kind: string;
  subject_id: string;
  ok: boolean;
  severity: string;
  last_seen: string;
  error: string;
  consecutive_failures: number;
};

export type CanonicalEvent = {
  task_id: string;
  agent_role: string;
  action: string;
  timestamp: string;
};

export type CanonicalEvidence = {
  evidence_bundle_id: string;
  task_id: string;
  bundle_type: string;
  timestamp: string;
};

export type CanonicalJob = {
  task_id: string;
  status: string;
  task_kind: string;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type CanonicalViolation = {
  id: string;
  violation_kind: string;
  subject: string;
  status: string;
  detected_at: string;
};

export function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  return fallback;
}

export function asObject<T extends object>(v: unknown): T | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null;
}

export function emptySnapshot(): CanonicalSnapshot {
  return {
    counts: {
      impressions: 0,
      clicks: 0,
      iterations: 0,
      subscriptions: 0,
      usage_credits: 0,
      referral_rewards: 0,
      canonical_routes_tracked: 0,
      canonical_approvals_recorded: 0,
      connectors_registered: 0,
      coherence_violations_detected: 0,
      coherence_violations_resolved: 0,
      open_violations: 0,
    },
    flags: {
      live_connection: false,
      wallet_configured: false,
      preview_ready: false,
      scheduler_active: false,
      coherence_ok: false,
    },
    lists: {
      routes: [],
      approvals: [],
      connectors: [],
      health: [],
      events: [],
      evidence: [],
      jobs: [],
      violations: [],
    },
    strings: {
      status: '',
      message: '',
      error: '',
    },
    generated_at: '',
  };
}

export function normalizeSnapshot(raw: unknown): CanonicalSnapshot {
  const empty = emptySnapshot();
  const obj = asObject<Record<string, unknown>>(raw);
  if (!obj) return empty;

  const counts = asObject<Record<string, unknown>>(obj.counts) ?? {};
  const flags = asObject<Record<string, unknown>>(obj.flags) ?? {};
  const lists = asObject<Record<string, unknown>>(obj.lists) ?? {};
  const strings = asObject<Record<string, unknown>>(obj.strings) ?? {};

  return {
    counts: {
      impressions: asNumber(counts.impressions),
      clicks: asNumber(counts.clicks),
      iterations: asNumber(counts.iterations),
      subscriptions: asNumber(counts.subscriptions),
      usage_credits: asNumber(counts.usage_credits),
      referral_rewards: asNumber(counts.referral_rewards),
      canonical_routes_tracked: asNumber(counts.canonical_routes_tracked),
      canonical_approvals_recorded: asNumber(counts.canonical_approvals_recorded),
      connectors_registered: asNumber(counts.connectors_registered),
      coherence_violations_detected: asNumber(counts.coherence_violations_detected),
      coherence_violations_resolved: asNumber(counts.coherence_violations_resolved),
      open_violations: asNumber(counts.open_violations),
    },
    flags: {
      live_connection: asBoolean(flags.live_connection),
      wallet_configured: asBoolean(flags.wallet_configured),
      preview_ready: asBoolean(flags.preview_ready),
      scheduler_active: asBoolean(flags.scheduler_active),
      coherence_ok: asBoolean(flags.coherence_ok),
    },
    lists: {
      routes: asArray<CanonicalRoute>(lists.routes).map(normalizeRoute),
      approvals: asArray<CanonicalApproval>(lists.approvals).map(normalizeApproval),
      connectors: asArray<CanonicalConnector>(lists.connectors).map(normalizeConnector),
      health: asArray<CanonicalHealth>(lists.health).map(normalizeHealth),
      events: asArray<CanonicalEvent>(lists.events).map(normalizeEvent),
      evidence: asArray<CanonicalEvidence>(lists.evidence).map(normalizeEvidence),
      jobs: asArray<CanonicalJob>(lists.jobs).map(normalizeJob),
      violations: asArray<CanonicalViolation>(lists.violations).map(normalizeViolation),
    },
    strings: {
      status: asString(strings.status),
      message: asString(strings.message),
      error: asString(strings.error),
    },
    generated_at: asString(obj.generated_at),
  };
}

function normalizeRoute(r: unknown): CanonicalRoute {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    route_key: asString(o.route_key),
    route_kind: asString(o.route_kind),
    status: asString(o.status, 'unknown'),
    last_verified_at: asString(o.last_verified_at),
    last_error: asString(o.last_error),
    consecutive_failures: asNumber(o.consecutive_failures),
  };
}

function normalizeApproval(r: unknown): CanonicalApproval {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    task_id: asString(o.task_id),
    state: asString(o.state, 'pending'),
    approved_by: asString(o.approved_by),
    blocked_by: asString(o.blocked_by),
    block_reason: asString(o.block_reason),
    updated_at: asString(o.updated_at),
  };
}

function normalizeConnector(r: unknown): CanonicalConnector {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    connector_key: asString(o.connector_key),
    connector_kind: asString(o.connector_kind),
    auth_method: asString(o.auth_method, 'none'),
    free_first: asBoolean(o.free_first),
    status: asString(o.status, 'unknown'),
    timeout_ms: asNumber(o.timeout_ms),
  };
}

function normalizeHealth(r: unknown): CanonicalHealth {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    subject_kind: asString(o.subject_kind),
    subject_id: asString(o.subject_id),
    ok: asBoolean(o.ok),
    severity: asString(o.severity, 'low'),
    last_seen: asString(o.last_seen),
    error: asString(o.error),
    consecutive_failures: asNumber(o.consecutive_failures),
  };
}

function normalizeEvent(r: unknown): CanonicalEvent {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    task_id: asString(o.task_id),
    agent_role: asString(o.agent_role),
    action: asString(o.action),
    timestamp: asString(o.timestamp),
  };
}

function normalizeEvidence(r: unknown): CanonicalEvidence {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    evidence_bundle_id: asString(o.evidence_bundle_id),
    task_id: asString(o.task_id),
    bundle_type: asString(o.bundle_type),
    timestamp: asString(o.timestamp),
  };
}

function normalizeJob(r: unknown): CanonicalJob {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    task_id: asString(o.task_id),
    status: asString(o.status, 'queued'),
    task_kind: asString(o.task_kind),
    priority: asNumber(o.priority),
    created_at: asString(o.created_at),
    updated_at: asString(o.updated_at),
  };
}

function normalizeViolation(r: unknown): CanonicalViolation {
  const o = asObject<Record<string, unknown>>(r) ?? {};
  return {
    id: asString(o.id),
    violation_kind: asString(o.violation_kind),
    subject: asString(o.subject),
    status: asString(o.status, 'open'),
    detected_at: asString(o.detected_at),
  };
}
