// Observability Agent: captures logs, screenshots, metrics, and before/after state.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "observability_agent";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, before: Record<string, unknown> = {}, after: Record<string, unknown> = {}, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error, before_state, after_state) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err}, ${sql.json(before)}, ${sql.json(after)})`;
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
    const path = url.pathname.replace(/^\/runtime-observability/, "") || "/";

    if (path === "/" || path === "/status") {
      const logs = await sql`SELECT count(*) as c FROM runtime_audit_log`;
      return json({ role: ROLE, permissions: ["log", "snapshot", "screenshot"], audit_records: Number(logs[0].c) });
    }

    if (path === "/snapshot" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const targetUrl = String(body.target_url ?? "");
      const phase = String(body.phase ?? "after"); // before|after

      let evidence: Record<string, unknown> = { phase };
      if (targetUrl) {
        try {
          const r = await fetch(targetUrl, { headers: { Accept: "application/json,text/html" } });
          const txt = await r.text();
          const hash = await sha(txt);
          evidence = { phase, url: targetUrl, status: r.status, content_length: txt.length, content_hash: hash, sampled_at: new Date().toISOString() };
        } catch (e) {
          evidence = { phase, url: targetUrl, error: e instanceof Error ? e.message : "fetch_error" };
        }
      }

      const metricsRows = await sql`SELECT metric_key, metric_value FROM projection_metrics ORDER BY metric_key LIMIT 50`;
      const metrics = Object.fromEntries(metricsRows.map(r => [r.metric_key, Number(r.metric_value)]));

      const before = phase === "before" ? evidence : {};
      const after = phase === "after" ? evidence : {};
      await audit(taskId, "snapshot", { phase, hash: evidence.content_hash ?? null }, evidence, before, after);
      await bump("agent_actions_observability_agent");

      return json({ status: "completed", diff_or_effect: { phase, captured: true }, evidence: { ...evidence, metrics_count: Object.keys(metrics).length }, error_if_any: null });
    }

    if (path === "/diverge-check" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const codeHash = String(body.code_hash ?? "");
      const uiHash = String(body.ui_hash ?? "");
      const diverged = codeHash !== uiHash && codeHash !== "" && uiHash !== "";
      const result = { code_hash: codeHash, ui_hash: uiHash, diverged };
      await audit(taskId, "diverge_check", result, result, {}, {}, diverged ? "code_ui_divergence" : null);
      if (diverged) return json({ status: "failed", diff_or_effect: result, evidence: result, error_if_any: "code_ui_divergence" });
      await bump("agent_actions_observability_agent");
      return json({ status: "completed", diff_or_effect: result, evidence: result, error_if_any: null });
    }

    if (path === "/audit") {
      const limit = Math.min(100, Number(url.searchParams.get("limit") ?? "30"));
      const taskFilter = url.searchParams.get("task_id");
      const rows = taskFilter ? await sql`SELECT task_id, agent_role, action, diff_or_effect, evidence, error, created_at FROM runtime_audit_log WHERE task_id = ${taskFilter} ORDER BY created_at DESC LIMIT ${limit}` : await sql`SELECT task_id, agent_role, action, diff_or_effect, evidence, error, created_at FROM runtime_audit_log ORDER BY created_at DESC LIMIT ${limit}`;
      return json({ audit_log: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/snapshot", "/diverge-check", "/audit"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
