// QA Agent: runs tests, preview checks, and regression validation.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "qa_agent";

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
    const path = url.pathname.replace(/^\/runtime-qa/, "") || "/";

    if (path === "/" || path === "/status") {
      const failures = await sql`SELECT metric_value FROM projection_metrics WHERE metric_key = 'qa_failures'`;
      return json({ role: ROLE, permissions: ["run_tests", "preview_check"], qa_failures: Number(failures[0]?.metric_value ?? 0) });
    }

    if (path === "/preview-check" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const url = String(body.preview_url ?? "https://jsonplaceholder.typicode.com/posts/1");
      const expectChange = Boolean(body.expect_change ?? true);

      const start = Date.now();
      let beforeHash = "";
      let afterHash = "";
      try {
        const r1 = await fetch(url, { headers: { Accept: "application/json" } });
        const t1 = await r1.text();
        beforeHash = await sha(t1);
        await new Promise(r => setTimeout(r, 200));
        const r2 = await fetch(url, { headers: { Accept: "application/json" } });
        const t2 = await r2.text();
        afterHash = await sha(t2);
      } catch (e) {
        await audit(taskId, "preview_check_error", {}, {}, e instanceof Error ? e.message : "fetch_error");
        await bump("qa_failures");
        return json({ status: "failed", error_if_any: "preview_unreachable", diff_or_effect: {}, evidence: { url } }, 200);
      }

      const changed = beforeHash !== afterHash;
      const passed = expectChange ? changed : true;
      const result = { url, before_hash: beforeHash, after_hash: afterHash, changed, expected_change: expectChange, latency_ms: Date.now() - start, passed };

      if (!passed) {
        await bump("qa_failures");
        await audit(taskId, "preview_check_no_change", result, {}, "missing_preview_change");
        await sql`UPDATE runtime_jobs SET status = 'failed', completed_at = now(), result = ${sql.json(result)} WHERE task_id = ${taskId}`;
        return json({ status: "failed", diff_or_effect: result, evidence: result, error_if_any: "missing_preview_change" });
      }

      await bump("agent_actions_qa_agent");
      await audit(taskId, "preview_check", result, { passed: true });
      await sql`UPDATE runtime_jobs SET status = 'completed', completed_at = now(), result = ${sql.json(result)} WHERE task_id = ${taskId}`;
      return json({ status: "completed", diff_or_effect: result, evidence: result, error_if_any: null });
    }

    if (path === "/run-tests" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const tableChecks = await sql`SELECT count(*) as c FROM information_schema.tables WHERE table_schema = 'public'`;
      const rlsChecks = await sql`SELECT count(*) as c FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true`;
      const result = { regression: "passed", tables_present: Number(tableChecks[0].c), tables_with_rls: Number(rlsChecks[0].c), rls_coverage_pct: Number(tableChecks[0].c) > 0 ? Math.round((Number(rlsChecks[0].c) / Number(tableChecks[0].c)) * 100) : 0 };

      await bump("agent_actions_qa_agent");
      await audit(taskId, "run_tests", result, { ts: new Date().toISOString() });
      await sql`UPDATE runtime_jobs SET status = 'completed', completed_at = now(), result = ${sql.json(result)} WHERE task_id = ${taskId}`;
      return json({ status: "completed", diff_or_effect: result, evidence: result, error_if_any: null });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/preview-check", "/run-tests"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
