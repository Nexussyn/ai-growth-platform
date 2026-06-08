// Orchestrator: routes work, ranks priority, enforces stop conditions.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "orchestrator";

const ROUTING: Record<string, string> = {
  discovery: "runtime-discovery",
  code: "runtime-code-edit",
  db: "runtime-db-migrate",
  qa: "runtime-qa",
  security: "runtime-security",
  deploy: "runtime-deploy",
  observability: "runtime-observability",
  rollback: "runtime-rollback",
};

const STOP_REASONS = ["security_violation", "missing_diff", "missing_preview_change", "source_loop", "failed_rollback", "code_ui_divergence"];

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}

async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

function classifyTaskKind(target: string, scope: string): string {
  const t = `${target} ${scope}`.toLowerCase();
  if (/(rollback|revert|restore)/.test(t)) return "rollback";
  if (/(deploy|release|ship)/.test(t)) return "deploy";
  if (/(security|policy|permission|secret)/.test(t)) return "security";
  if (/(test|qa|preview|regress)/.test(t)) return "qa";
  if (/(migration|schema|table|column|rls)/.test(t)) return "db";
  if (/(code|edit|refactor|component|file)/.test(t)) return "code";
  if (/(log|metric|screenshot|snapshot|telemetry)/.test(t)) return "observability";
  return "discovery";
}

function rankPriority(risk: string, kind: string): number {
  const riskScore = risk === "high" ? 10 : risk === "medium" ? 5 : 1;
  const kindBoost: Record<string, number> = { rollback: 100, security: 80, deploy: 60, db: 50, qa: 40, code: 30, observability: 20, discovery: 10 };
  return (kindBoost[kind] ?? 0) + riskScore;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-discovery/, "") || "/";

    if (path === "/" || path === "/status") {
      const queued = await sql`SELECT count(*) as c FROM runtime_jobs WHERE status = 'queued'`;
      const running = await sql`SELECT count(*) as c FROM runtime_jobs WHERE status = 'running'`;
      const dead = await sql`SELECT count(*) as c FROM runtime_jobs WHERE status = 'dead_letter'`;
      const agents = await sql`SELECT role, endpoint_url, enabled, last_heartbeat FROM runtime_agents`;
      return json({ role: ROLE, queued: Number(queued[0].c), running: Number(running[0].c), dead_letter: Number(dead[0].c), agents, routing: ROUTING, stop_reasons: STOP_REASONS });
    }

    if (path === "/route" && req.method === "POST") {
      const body = await req.json();
      const taskId = body.task_id ?? crypto.randomUUID();
      const kind = classifyTaskKind(body.target ?? "", body.scope ?? "");
      const role = kind === "discovery" ? "orchestrator" : `${kind}_agent`.replace("db_agent", "db_agent");
      const priority = rankPriority(body.risk_level ?? "low", kind);

      await sql`INSERT INTO runtime_jobs (task_id, agent_role, target, scope, success_metric, risk_level, rollback_plan, approval_state, payload, correlation_id, parent_task_id) VALUES (${taskId}, ${role}, ${body.target ?? ""}, ${body.scope ?? ""}, ${body.success_metric ?? ""}, ${body.risk_level ?? "low"}, ${body.rollback_plan ?? "no-op"}, ${body.approval_state ?? "pending"}, ${sql.json(body.payload ?? {})}, ${body.correlation_id ?? taskId}, ${body.parent_task_id ?? null})`;
      await bump("orchestrator_jobs_routed");
      await audit(taskId, "route", { kind, role, priority, endpoint: ROUTING[kind] }, { request: body });
      return json({ status: "routed", task_id: taskId, kind, agent_role: role, endpoint: `/functions/v1/${ROUTING[kind]}`, priority });
    }

    if (path === "/jobs") {
      const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "20"));
      const status = url.searchParams.get("status");
      const rows = status ? await sql`SELECT task_id, agent_role, target, status, risk_level, approval_state, attempts, created_at FROM runtime_jobs WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit}` : await sql`SELECT task_id, agent_role, target, status, risk_level, approval_state, attempts, created_at FROM runtime_jobs ORDER BY created_at DESC LIMIT ${limit}`;
      return json({ jobs: rows });
    }

    if (path === "/stop" && req.method === "POST") {
      const body = await req.json();
      const reason = String(body.reason ?? "");
      if (!STOP_REASONS.includes(reason)) return json({ error: "invalid_stop_reason", allowed: STOP_REASONS }, 400);
      await sql`UPDATE runtime_jobs SET status = 'failed', result = ${sql.json({ stopped: reason })} WHERE status IN ('queued', 'running')`;
      await audit(body.task_id ?? "all", "stop", { reason }, body);
      return json({ stopped: true, reason });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/route", "/jobs", "/stop"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
