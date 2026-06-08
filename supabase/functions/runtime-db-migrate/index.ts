// DB Agent: creates migrations and writes schema changes only.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "db_agent";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}

async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const FORBIDDEN = /(\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b|\bDELETE\s+FROM\b)/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-db-migrate/, "") || "/";

    if (path === "/" || path === "/status") {
      const proposed = await sql`SELECT count(*) as c FROM runtime_artifacts WHERE kind = 'migration'`;
      const tables = await sql`SELECT count(*) as c FROM information_schema.tables WHERE table_schema = 'public'`;
      return json({ role: ROLE, permissions: ["propose_migration"], migrations_proposed: Number(proposed[0].c), public_tables: Number(tables[0].c) });
    }

    if (path === "/propose" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const sqlText = String(body.sql ?? "");
      const summary = String(body.summary ?? "");

      if (!sqlText) {
        await audit(taskId, "propose_migration_missing", {}, {}, "missing_diff");
        return json({ status: "failed", error_if_any: "missing_diff", diff_or_effect: {}, evidence: {} }, 400);
      }
      if (FORBIDDEN.test(sqlText)) {
        await audit(taskId, "propose_migration_blocked", { reason: "destructive_sql" }, { sql_preview: sqlText.slice(0, 200) }, "destructive_sql_blocked");
        return json({ status: "blocked", error_if_any: "destructive_sql_blocked", diff_or_effect: { reason: "destructive operations not allowed" }, evidence: {} }, 400);
      }

      const hash = await sha(sqlText);
      const stmts = sqlText.split(";").map(s => s.trim()).filter(Boolean);
      const effect = { summary, statement_count: stmts.length, hash, contains_create: /CREATE\s+TABLE/i.test(sqlText), contains_alter: /ALTER\s+TABLE/i.test(sqlText), contains_rls: /ROW\s+LEVEL\s+SECURITY/i.test(sqlText) };

      await sql`INSERT INTO runtime_artifacts (task_id, kind, content, hash) VALUES (${taskId}, 'migration', ${JSON.stringify({ sql: sqlText, summary })}, ${hash})`;
      await sql`UPDATE runtime_jobs SET status = 'completed', completed_at = now(), result = ${sql.json(effect)} WHERE task_id = ${taskId}`;
      await bump("agent_actions_db_agent");
      await audit(taskId, "propose_migration", effect, { hash });

      return json({ status: "completed", diff_or_effect: effect, evidence: { hash, persisted: true }, error_if_any: null });
    }

    if (path === "/migrations") {
      const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "20"));
      const rows = await sql`SELECT id, task_id, hash, approved_at, deployed, created_at FROM runtime_artifacts WHERE kind = 'migration' ORDER BY created_at DESC LIMIT ${limit}`;
      return json({ migrations: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/propose", "/migrations"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
