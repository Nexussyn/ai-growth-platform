// Code Agent: edits source files and proposes diffs only.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "code_agent";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}

async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-code-edit/, "") || "/";

    if (path === "/" || path === "/status") {
      const proposed = await sql`SELECT count(*) as c FROM runtime_artifacts WHERE kind = 'code_diff'`;
      const approved = await sql`SELECT count(*) as c FROM runtime_artifacts WHERE kind = 'code_diff' AND approved_at IS NOT NULL`;
      return json({ role: ROLE, permissions: ["propose_diff"], diffs_proposed: Number(proposed[0].c), diffs_approved: Number(approved[0].c) });
    }

    if (path === "/propose" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const filePath = String(body.file_path ?? "");
      const before = String(body.before ?? "");
      const after = String(body.after ?? "");

      if (!filePath || !after) {
        await audit(taskId, "propose_diff_missing", { file_path: filePath }, {}, "missing_diff");
        return json({ status: "failed", error_if_any: "missing_diff", diff_or_effect: {}, evidence: {} }, 400);
      }

      const diffHash = await sha(`${filePath}\n${before}\n---\n${after}`);
      const diffSummary = { file_path: filePath, before_lines: before.split("\n").length, after_lines: after.split("\n").length, change_size: Math.abs(after.length - before.length), hash: diffHash };

      await sql`INSERT INTO runtime_artifacts (task_id, kind, content, hash) VALUES (${taskId}, 'code_diff', ${JSON.stringify({ file_path: filePath, before, after })}, ${diffHash})`;
      await sql`UPDATE runtime_jobs SET status = 'completed', completed_at = now(), result = ${sql.json({ diff_hash: diffHash, ...diffSummary })} WHERE task_id = ${taskId}`;
      await bump("agent_actions_code_agent");
      await audit(taskId, "propose_diff", diffSummary, { hash: diffHash });

      return json({ status: "completed", diff_or_effect: diffSummary, evidence: { hash: diffHash, persisted: true }, error_if_any: null });
    }

    if (path === "/diffs") {
      const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "20"));
      const rows = await sql`SELECT id, task_id, hash, approved_at, deployed, created_at FROM runtime_artifacts WHERE kind = 'code_diff' ORDER BY created_at DESC LIMIT ${limit}`;
      return json({ diffs: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/propose", "/diffs"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
