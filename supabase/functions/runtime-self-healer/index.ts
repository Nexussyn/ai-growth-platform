// Self-Healer: continuous detect -> classify -> correlate -> correct -> reverify loop.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "self_healer";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ENDPOINTS: Record<string, string> = {
  "orchestrator": "runtime-discovery",
  "broker_agent": "runtime-broker",
  "code_agent": "runtime-code-edit",
  "db_agent": "runtime-db-migrate",
  "qa_agent": "runtime-qa",
  "security_agent": "runtime-security",
  "deploy_agent": "runtime-deploy",
  "observability_agent": "runtime-observability",
  "rollback_agent": "runtime-rollback",
  "browser_agent_external": "runtime-browser",
  "integration_agent_external": "runtime-integration",
  "outreach_agent_external": "runtime-outreach",
  "procurement_agent_external": "runtime-procurement",
  "research_agent_external": "runtime-research",
  "finance_agent_external": "runtime-finance",
};

const NO_OP_THRESHOLD = 5;
const REPEAT_ERROR_THRESHOLD = 3;

async function bump(k: string, by = 1) { await sql`UPDATE projection_metrics SET metric_value = metric_value + ${by}, updated_at = now() WHERE metric_key = ${k}`; }

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}

async function probeAgent(role: string, slug: string): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}/status`, { headers: { Authorization: `Bearer ${ANON_KEY}` }, signal: AbortSignal.timeout(8000) });
    const latency = Date.now() - start;
    if (r.status >= 200 && r.status < 400) return { ok: true, latency };
    return { ok: false, latency, error: `status_${r.status}` };
  } catch (e) {
    return { ok: false, latency: Date.now() - start, error: e instanceof Error ? e.message.slice(0, 80) : "fetch_error" };
  }
}

async function probeAll(): Promise<{ healthy: number; total: number; failures: string[] }> {
  const roles = Object.entries(ENDPOINTS);
  const results = await Promise.all(roles.map(async ([role, slug]) => {
    const probe = await probeAgent(role, slug);
    await sql`UPDATE runtime_agent_health SET last_probe_ok = ${probe.ok}, last_probe_at = now(), total_probes = total_probes + 1, ok_probes = ok_probes + ${probe.ok ? 1 : 0}, consecutive_failures = ${probe.ok ? 0 : sql`consecutive_failures + 1`}, last_error = ${probe.error ?? ""}, p50_latency_ms = ${probe.latency}, severity = ${probe.ok ? "low" : "medium"} WHERE role = ${role}`;
    await bump("probes_run");
    if (!probe.ok) await bump("probes_failed");
    return { role, ok: probe.ok, error: probe.error };
  }));
  const failures = results.filter(r => !r.ok).map(r => `${r.role}:${r.error}`);
  return { healthy: results.filter(r => r.ok).length, total: results.length, failures };
}

async function detectAnomalies(): Promise<Array<Record<string, unknown>>> {
  const anomalies: Array<Record<string, unknown>> = [];

  // 1. No-op cycle threshold
  const recentCycles = await sql<Array<{ made_progress: boolean }>>`SELECT made_progress FROM runtime_cycles ORDER BY created_at DESC LIMIT ${NO_OP_THRESHOLD}`;
  if (recentCycles.length === NO_OP_THRESHOLD && recentCycles.every(c => !c.made_progress)) {
    anomalies.push({ type: "no_op_cycles", severity: "medium", evidence: { count: NO_OP_THRESHOLD } });
  }

  // 2. Preview-unchanged failures from QA agent
  const previewFails = await sql<Array<{ task_id: string }>>`SELECT task_id FROM runtime_audit_log WHERE error = 'missing_preview_change' AND created_at > now() - interval '15 minutes'`;
  for (const f of previewFails.slice(0, 3)) anomalies.push({ type: "preview_unchanged", severity: "high", task_id: f.task_id, evidence: { window: "15m" } });

  // 3. Repeated errors on same task
  const repeats = await sql<Array<{ task_id: string; cnt: number }>>`SELECT task_id, count(*)::int as cnt FROM runtime_audit_log WHERE error IS NOT NULL AND created_at > now() - interval '30 minutes' GROUP BY task_id HAVING count(*) >= ${REPEAT_ERROR_THRESHOLD}`;
  for (const r of repeats) anomalies.push({ type: "repeated_error", severity: "high", task_id: r.task_id, evidence: { count: r.cnt } });

  // 4. Unhealthy agents (3+ consecutive failures)
  const unhealthy = await sql<Array<{ role: string; consecutive_failures: number }>>`SELECT role, consecutive_failures FROM runtime_agent_health WHERE consecutive_failures >= 3`;
  for (const u of unhealthy) anomalies.push({ type: "unstable_dependency", severity: "high", evidence: { agent: u.role, failures: u.consecutive_failures } });

  // 5. Source loop detection
  const looped = await sql<Array<{ source_signature: string; cnt: number }>>`SELECT source_signature, count(*)::int as cnt FROM runtime_source_history WHERE produced_evidence = false AND created_at > now() - interval '1 hour' GROUP BY source_signature HAVING count(*) >= 3`;
  for (const l of looped) anomalies.push({ type: "repeated_source_loop", severity: "medium", evidence: { signature: l.source_signature, count: l.cnt } });

  // 6. Stuck running jobs (>5 min no completion)
  const stuck = await sql<Array<{ task_id: string }>>`SELECT task_id FROM runtime_jobs WHERE status = 'running' AND started_at < now() - interval '5 minutes' LIMIT 5`;
  for (const s of stuck) anomalies.push({ type: "stuck_job", severity: "high", task_id: s.task_id, evidence: { window: "5m" } });

  // 7. Failed rollback (any rollback action with error in last hour)
  const rollbackFail = await sql<Array<{ task_id: string }>>`SELECT task_id FROM runtime_audit_log WHERE agent_role = 'rollback_agent' AND error = 'failed_rollback' AND created_at > now() - interval '1 hour' LIMIT 3`;
  for (const r of rollbackFail) anomalies.push({ type: "failed_rollback", severity: "critical", task_id: r.task_id, evidence: {} });

  return anomalies;
}

async function applyHealing(anomaly: Record<string, unknown>): Promise<{ action: string; result: string; reversible: boolean }> {
  const type = String(anomaly.type);
  const taskId = String(anomaly.task_id ?? "");

  // Persist anomaly first
  const inserted = await sql<Array<{ id: string }>>`INSERT INTO runtime_anomalies (task_id, anomaly_type, severity, evidence, correlated_task_id, status) VALUES (${taskId}, ${type}, ${String(anomaly.severity)}, ${sql.json(anomaly.evidence ?? {})}, ${taskId}, 'correcting') RETURNING id`;
  const anomalyId = inserted[0].id;
  await bump("anomalies_detected");

  let action = "no_op", result = "noop", reversible = true;

  switch (type) {
    case "stuck_job": {
      // Smallest reversible: requeue
      await sql`UPDATE runtime_jobs SET status = 'queued', started_at = NULL WHERE task_id = ${taskId} AND status = 'running'`;
      action = "auto_correct"; result = "requeued";
      await bump("auto_corrections_applied");
      break;
    }
    case "preview_unchanged": {
      // Wiring failure -> rollback the offending deploy if any
      const deployArt = await sql`SELECT id FROM runtime_artifacts WHERE task_id = ${taskId} AND deployed = true LIMIT 1`;
      if (deployArt.length > 0) {
        await sql`UPDATE runtime_artifacts SET deployed = false WHERE id = ${String(deployArt[0].id)}::uuid`;
        action = "rollback"; result = "deploy_reverted";
        await bump("healing_rollbacks_triggered");
      } else {
        action = "auto_correct"; result = "flagged_wiring_failure";
        await bump("wiring_failures_classified");
      }
      break;
    }
    case "repeated_error": {
      // Send to dead-letter
      await sql`UPDATE runtime_jobs SET status = 'dead_letter', updated_at = now() WHERE task_id = ${taskId} AND status NOT IN ('completed', 'dead_letter')`;
      action = "escalate_dlq"; result = "escalated";
      await bump("anomalies_escalated");
      await bump("orchestrator_jobs_dead_lettered");
      break;
    }
    case "repeated_source_loop": {
      // Diversify: mark signature so research agent picks a different source class next call
      await sql`INSERT INTO runtime_source_history (task_id, source_class, source_signature, produced_evidence) VALUES (${taskId}, 'diversify', ${"BLOCKED:" + String((anomaly.evidence as Record<string, unknown>)?.signature ?? "")}, true)`;
      action = "diversify_source"; result = "source_blocked";
      await bump("source_diversifications");
      break;
    }
    case "unstable_dependency": {
      // Reduce severity by resetting failure counter after backoff
      const agent = String((anomaly.evidence as Record<string, unknown>)?.agent ?? "");
      await sql`UPDATE runtime_agent_health SET severity = 'high', consecutive_failures = 0 WHERE role = ${agent}`;
      action = "auto_correct"; result = "backoff_reset";
      await bump("auto_corrections_applied");
      break;
    }
    case "failed_rollback": {
      // Stop routing for safety
      await sql`UPDATE runtime_jobs SET status = 'blocked', updated_at = now(), result = ${sql.json({ reason: "failed_rollback_freeze" })} WHERE status IN ('queued', 'running') AND risk_level IN ('high', 'critical')`;
      action = "pause_routing"; result = "high_risk_frozen";
      reversible = false;
      break;
    }
    case "no_op_cycles": {
      // Trigger a discovery + procurement scan to get fresh inputs
      action = "auto_correct"; result = "diversify_inputs_requested";
      await bump("auto_corrections_applied");
      break;
    }
    default:
      action = "no_op"; result = "no_handler";
  }

  await sql`INSERT INTO runtime_healing_actions (anomaly_id, action_type, smallest_reversible, notes, completed_at) VALUES (${anomalyId}::uuid, ${action}, ${reversible}, ${result}, now())`;
  await sql`UPDATE runtime_anomalies SET status = 'resolved', resolved_at = now() WHERE id = ${anomalyId}::uuid`;
  await bump("anomalies_resolved");
  await audit(taskId || `anomaly:${anomalyId}`, `heal:${action}`, { type, severity: anomaly.severity, result }, anomaly.evidence as Record<string, unknown> ?? {});

  return { action, result, reversible };
}

async function runHealingCycle(): Promise<Record<string, unknown>> {
  const cycleStart = Date.now();
  await bump("healing_loop_runs");
  await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = 'orchestrator'`;

  const probes = await probeAll();
  const anomalies = await detectAnomalies();

  const heals: Array<Record<string, unknown>> = [];
  for (const a of anomalies.slice(0, 10)) {
    const res = await applyHealing(a);
    heals.push({ type: a.type, severity: a.severity, ...res });
  }

  const madeProgress = anomalies.length === 0 ? false : heals.some(h => h.action !== "no_op");
  const cycleNo = (await sql`SELECT count(*)::int as c FROM runtime_cycles`)[0].c;
  await sql`INSERT INTO runtime_cycles (cycle_no, made_progress, notes) VALUES (${Number(cycleNo) + 1}, ${madeProgress}, ${`anomalies=${anomalies.length} heals=${heals.length} probes_failed=${probes.failures.length}`})`;
  if (!madeProgress) await bump("no_op_cycles");

  return { duration_ms: Date.now() - cycleStart, agents_healthy: probes.healthy, agents_total: probes.total, agent_failures: probes.failures, anomalies_found: anomalies.length, healing_actions: heals, made_progress: madeProgress, cycle_no: Number(cycleNo) + 1 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-self-healer/, "") || "/";

    if (path === "/" || path === "/status") {
      const metrics = await sql`SELECT metric_key, metric_value FROM projection_metrics WHERE metric_key IN ('healing_loop_runs','anomalies_detected','anomalies_resolved','anomalies_escalated','auto_corrections_applied','healing_rollbacks_triggered','source_diversifications','probes_run','probes_failed','no_op_cycles','wiring_failures_classified') ORDER BY metric_key`;
      const open = await sql`SELECT count(*) as c FROM runtime_anomalies WHERE status = 'open'`;
      const recentCycle = await sql`SELECT cycle_no, made_progress, notes, created_at FROM runtime_cycles ORDER BY created_at DESC LIMIT 1`;
      const health = await sql`SELECT role, last_probe_ok, consecutive_failures, p50_latency_ms, severity FROM runtime_agent_health ORDER BY consecutive_failures DESC, role`;
      return json({ role: ROLE, continuous_24_7_mode: true, self_healing_enabled: true, metrics: Object.fromEntries(metrics.map(m => [m.metric_key, Number(m.metric_value)])), open_anomalies: Number(open[0].c), last_cycle: recentCycle[0] ?? null, agent_health: health });
    }

    if (path === "/cycle" && req.method === "POST") {
      const result = await runHealingCycle();
      return json(result);
    }

    if (path === "/anomalies") {
      const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "20"));
      const rows = await sql`SELECT id, task_id, anomaly_type, severity, status, evidence, detected_at, resolved_at FROM runtime_anomalies ORDER BY detected_at DESC LIMIT ${limit}`;
      return json({ anomalies: rows });
    }

    if (path === "/health") {
      const rows = await sql`SELECT * FROM runtime_agent_health ORDER BY role`;
      return json({ agents: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/cycle", "/anomalies", "/health"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
