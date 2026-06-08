// Rollback Agent: restores last known good state if any critical check fails.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "rollback_agent";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}

async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-rollback/, "") || "/";

    if (path === "/" || path === "/status") {
      const points = await sql`SELECT count(*) as c FROM runtime_rollback_points`;
      const executed = await sql`SELECT metric_value FROM projection_metrics WHERE metric_key = 'rollbacks_executed'`;
      return json({ role: ROLE, permissions: ["restore_known_good"], rollback_points: Number(points[0].c), rollbacks_executed: Number(executed[0]?.metric_value ?? 0) });
    }

    if (path === "/restore" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const targetTag = body.tag ? String(body.tag) : null;

      const rbRows = targetTag ? await sql`SELECT id, tag, state_snapshot, created_at FROM runtime_rollback_points WHERE tag = ${targetTag} LIMIT 1` : await sql`SELECT id, tag, state_snapshot, created_at FROM runtime_rollback_points ORDER BY created_at DESC LIMIT 1`;
      if (rbRows.length === 0) {
        await audit(taskId, "rollback_no_point", { tag: targetTag }, {}, "failed_rollback");
        return json({ status: "failed", error_if_any: "failed_rollback", diff_or_effect: { reason: "no rollback point found" }, evidence: {} }, 400);
      }
      const point = rbRows[0];
      const snapshot = point.state_snapshot as Record<string, unknown>;

      // Reverse deploy of any artifacts referenced in the snapshot
      const artifactIds = Array.isArray(snapshot.artifacts) ? snapshot.artifacts as string[] : [];
      let reverted = 0;
      for (const aid of artifactIds) {
        const r = await sql`UPDATE runtime_artifacts SET deployed = false WHERE id = ${aid}::uuid AND deployed = true`;
        reverted += (r.count ?? 0);
      }

      const result = { restored_tag: point.tag, restored_at: new Date().toISOString(), artifacts_reverted: reverted, source_snapshot_at: point.created_at };
      await bump("rollbacks_executed");
      await bump("agent_actions_rollback_agent");
      await audit(taskId, "restore", result, snapshot);
      await sql`UPDATE runtime_jobs SET status = 'completed', completed_at = now(), result = ${sql.json(result)} WHERE task_id = ${taskId}`;

      return json({ status: "completed", diff_or_effect: result, evidence: { snapshot, reverted }, error_if_any: null });
    }

    if (path === "/points") {
      const rows = await sql`SELECT id, tag, state_snapshot, created_at FROM runtime_rollback_points ORDER BY created_at DESC LIMIT 50`;
      return json({ rollback_points: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/restore", "/points"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
