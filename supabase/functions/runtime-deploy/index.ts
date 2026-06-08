// Deploy Agent: applies approved artifacts to staging or production.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "deploy_agent";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}

async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-deploy/, "") || "/";

    if (path === "/" || path === "/status") {
      const total = await sql`SELECT count(*) as c FROM runtime_artifacts WHERE deployed = true`;
      const pending = await sql`SELECT count(*) as c FROM runtime_artifacts WHERE approved_at IS NOT NULL AND deployed = false`;
      return json({ role: ROLE, permissions: ["apply_approved_artifact"], deployed: Number(total[0].c), approved_pending: Number(pending[0].c) });
    }

    if (path === "/apply" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? "");
      const environment = String(body.environment ?? "staging");

      const artifactRows = await sql`SELECT id, kind, hash, approved_at FROM runtime_artifacts WHERE task_id = ${taskId} AND deployed = false`;
      if (artifactRows.length === 0) {
        await audit(taskId, "deploy_no_artifact", { task_id: taskId }, {}, "no_approved_artifact");
        return json({ status: "failed", error_if_any: "no_approved_artifact", diff_or_effect: {}, evidence: {} }, 400);
      }
      const unapproved = artifactRows.filter(r => r.approved_at === null);
      if (unapproved.length > 0) {
        await audit(taskId, "deploy_unapproved", { unapproved_count: unapproved.length }, {}, "unapproved_artifact");
        return json({ status: "failed", error_if_any: "unapproved_artifact", diff_or_effect: { unapproved_count: unapproved.length }, evidence: {} }, 400);
      }

      // Snapshot rollback point before deploy
      const rbTag = `pre_deploy_${taskId}_${Date.now()}`;
      await sql`INSERT INTO runtime_rollback_points (tag, state_snapshot) VALUES (${rbTag}, ${sql.json({ task_id: taskId, artifacts: artifactRows.map(r => r.id), environment })})`;

      // Mark artifacts deployed (representing successful application)
      const deployedIds: string[] = [];
      for (const a of artifactRows) {
        await sql`UPDATE runtime_artifacts SET deployed = true, deployed_at = now() WHERE id = ${String(a.id)}::uuid`;
        deployedIds.push(String(a.id));
      }

      const result = { environment, artifacts_deployed: deployedIds.length, hashes: artifactRows.map(r => r.hash), rollback_point: rbTag };
      await bump("agent_actions_deploy_agent");
      await audit(taskId, "deploy", result, { rollback_tag: rbTag });
      await sql`UPDATE runtime_jobs SET status = 'completed', completed_at = now(), result = ${sql.json(result)} WHERE task_id = ${taskId}`;

      return json({ status: "completed", diff_or_effect: result, evidence: { rollback_tag: rbTag }, error_if_any: null });
    }

    if (path === "/deployments") {
      const rows = await sql`SELECT id, task_id, kind, hash, deployed_at FROM runtime_artifacts WHERE deployed = true ORDER BY deployed_at DESC LIMIT 30`;
      return json({ deployments: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/apply", "/deployments"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
