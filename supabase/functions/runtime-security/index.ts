// Security Agent: checks policy, secrets, permissions, and unsafe operations.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "security_agent";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}

async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

const UNSAFE_PATTERNS = [
  { name: "secret_exposure", regex: /(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|sk_live_|api_key\s*=\s*["'][a-z0-9]{20,})/i },
  { name: "destructive_sql", regex: /(\bDROP\s+(TABLE|DATABASE)\b|\bTRUNCATE\b)/i },
  { name: "permissive_rls", regex: /USING\s*\(\s*true\s*\)/i },
  { name: "raw_eval", regex: /\beval\s*\(/ },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-security/, "") || "/";

    if (path === "/" || path === "/status") {
      const blocks = await sql`SELECT metric_value FROM projection_metrics WHERE metric_key = 'security_blocks'`;
      return json({ role: ROLE, permissions: ["block", "approve"], security_blocks: Number(blocks[0]?.metric_value ?? 0), policies: UNSAFE_PATTERNS.map(p => p.name) });
    }

    if (path === "/check" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const content = String(body.content ?? "");
      const minimalPermissions = Array.isArray(body.minimal_permissions) ? body.minimal_permissions : [];
      const declaredPermissions = Array.isArray(body.declared_permissions) ? body.declared_permissions : [];

      const violations: Array<{ name: string; matched: string }> = [];
      for (const pat of UNSAFE_PATTERNS) {
        const m = content.match(pat.regex);
        if (m) violations.push({ name: pat.name, matched: m[0].slice(0, 80) });
      }

      const missingPerms = minimalPermissions.filter((p: string) => !declaredPermissions.includes(p));
      const blocked = violations.length > 0 || missingPerms.length > 0;

      const result = { passed: !blocked, violations, missing_permissions: missingPerms, declared_permissions: declaredPermissions };

      if (blocked) {
        await bump("security_blocks");
        await audit(taskId, "block", result, { reason: violations.length ? "unsafe_pattern" : "missing_permissions" }, "security_violation");
        await sql`UPDATE runtime_jobs SET status = 'failed', approval_state = 'blocked', completed_at = now(), result = ${sql.json(result)} WHERE task_id = ${taskId}`;
        return json({ status: "blocked", diff_or_effect: result, evidence: result, error_if_any: "security_violation" });
      }

      await bump("agent_actions_security_agent");
      await audit(taskId, "approve", result, { ts: new Date().toISOString() });
      await sql`UPDATE runtime_jobs SET status = 'completed', approval_state = 'approved', completed_at = now(), result = ${sql.json(result)} WHERE task_id = ${taskId}`;
      // Also approve any artifacts attached to this task
      await sql`UPDATE runtime_artifacts SET approved_by = ${ROLE}, approved_at = now() WHERE task_id = ${taskId} AND approved_at IS NULL`;
      return json({ status: "completed", diff_or_effect: result, evidence: result, error_if_any: null });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/check"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
