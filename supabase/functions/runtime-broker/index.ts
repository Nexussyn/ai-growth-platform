// Broker Agent: dispatches tasks from the runtime_jobs queue to the correct agent.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "broker_agent";

const ROUTING: Record<string, string> = {
  discovery: "runtime-discovery", code_edit: "runtime-code-edit", db_migrate: "runtime-db-migrate",
  qa: "runtime-qa", security: "runtime-security", deploy: "runtime-deploy", observability: "runtime-observability",
  rollback: "runtime-rollback", browser: "runtime-browser", integration: "runtime-integration",
  outreach: "runtime-outreach", procurement: "runtime-procurement", research: "runtime-research", finance: "runtime-finance",
};

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}
async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-broker/, "") || "/";

    if (path === "/" || path === "/status") {
      const queued = await sql`SELECT count(*) as c FROM runtime_jobs WHERE status = 'queued'`;
      const running = await sql`SELECT count(*) as c FROM runtime_jobs WHERE status = 'running'`;
      const dlq = await sql`SELECT count(*) as c FROM runtime_jobs WHERE status = 'dead_letter'`;
      return json({ role: ROLE, permissions: ["dispatch", "rebalance"], queued: Number(queued[0].c), running: Number(running[0].c), dead_letter: Number(dlq[0].c), routing: ROUTING });
    }

    if (path === "/dispatch" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const batchSize = Math.min(5, Number(body.batch_size ?? 5));
      const jobs = await sql`SELECT task_id, task_kind, agent_role, target, scope, risk_level, retries, attempts, max_attempts, budget_mode FROM runtime_jobs WHERE status = 'queued' ORDER BY priority DESC, created_at ASC LIMIT ${batchSize}`;

      const dispatched: Array<Record<string, unknown>> = [];
      for (const job of jobs) {
        const kind = String(job.task_kind || "discovery");
        const endpoint = ROUTING[kind] ?? "runtime-discovery";

        if (Number(job.attempts) >= Number(job.max_attempts)) {
          await sql`UPDATE runtime_jobs SET status = 'dead_letter', updated_at = now() WHERE task_id = ${String(job.task_id)}`;
          await bump("orchestrator_jobs_dead_lettered");
          await audit(String(job.task_id), "dead_letter", { reason: "dead_letter_threshold_reached" }, { attempts: job.attempts });
          dispatched.push({ task_id: job.task_id, decision: "dead_letter" });
          continue;
        }

        if (String(job.budget_mode) === "paid_allowed") {
          const budget = await sql`SELECT paid_unlocked FROM runtime_budget WHERE id = 1`;
          if (!budget[0].paid_unlocked) {
            await sql`UPDATE runtime_jobs SET status = 'blocked', updated_at = now(), result = ${sql.json({ reason: "paid_intelligence_locked" })} WHERE task_id = ${String(job.task_id)}`;
            await audit(String(job.task_id), "block", { reason: "paid_intelligence_locked" }, {}, "unauthorized_spend");
            dispatched.push({ task_id: job.task_id, decision: "blocked", reason: "paid_locked" });
            continue;
          }
        }

        await sql`UPDATE runtime_jobs SET status = 'running', started_at = now(), updated_at = now(), attempts = attempts + 1 WHERE task_id = ${String(job.task_id)}`;
        await bump("agent_actions_broker_agent");
        await audit(String(job.task_id), "dispatch", { kind, endpoint, agent: job.agent_role }, { batch_size: batchSize });
        dispatched.push({ task_id: job.task_id, decision: "dispatched", endpoint: `/functions/v1/${endpoint}`, kind });
      }

      return json({ status: "ok", dispatched_count: dispatched.length, dispatched });
    }

    if (path === "/dlq") {
      const rows = await sql`SELECT task_id, task_kind, target, attempts, result, created_at FROM runtime_jobs WHERE status = 'dead_letter' ORDER BY updated_at DESC LIMIT 30`;
      return json({ dead_letter: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/dispatch", "/dlq"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
