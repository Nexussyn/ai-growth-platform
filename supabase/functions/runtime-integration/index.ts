// Integration Agent: wires APIs, webhooks, and third-party services (free-first).
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "integration_agent_external";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}
async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }
async function sha(s: string): Promise<string> { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-integration/, "") || "/";

    if (path === "/" || path === "/status") {
      const wirings = await sql`SELECT metric_value FROM projection_metrics WHERE metric_key = 'integration_wirings_completed'`;
      return json({ role: ROLE, permissions: ["wire_api", "register_webhook"], wirings_completed: Number(wirings[0]?.metric_value ?? 0) });
    }

    if (path === "/wire" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const service = String(body.service ?? "");
      const endpoint = String(body.endpoint ?? "");
      const isPaid = Boolean(body.is_paid ?? false);

      if (isPaid) {
        const budget = await sql`SELECT paid_unlocked FROM runtime_budget WHERE id = 1`;
        if (!budget[0].paid_unlocked) {
          await audit(taskId, "wire_blocked_paid_locked", { service, endpoint }, {}, "unauthorized_spend");
          return json({ task_id: taskId, agent_role: ROLE, status: "blocked", effect: { type: "none", summary: "paid_locked", artifacts: [] }, evidence: {}, next_step: "request_finance_approval", error_if_any: { code: "unauthorized_spend", message: "paid intelligence locked", details: null }, timestamp: new Date().toISOString() });
        }
      }

      // Verify connector reachability (free-tier ping)
      let status = 0, hash = "", responseLen = 0;
      try {
        const r = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
        const t = await r.text();
        status = r.status; responseLen = t.length; hash = await sha(t);
      } catch (e) {
        await audit(taskId, "wire_unreachable", { service, endpoint }, { error: e instanceof Error ? e.message : "fetch_error" }, "external_unreachable");
        return json({ task_id: taskId, agent_role: ROLE, status: "failed", effect: { type: "none", summary: "unreachable", artifacts: [] }, evidence: { log_refs: [taskId] }, next_step: "retry_or_replace_connector", error_if_any: { code: "external_unreachable", message: "endpoint did not respond", details: { service, endpoint } }, timestamp: new Date().toISOString() });
      }

      await sql`INSERT INTO runtime_external_calls (task_id, agent_role, connector, endpoint, is_paid, status_code, response_hash, reversible) VALUES (${taskId}, ${ROLE}, ${service}, ${endpoint}, ${isPaid}, ${status}, ${hash}, true)`;

      const passed = status >= 200 && status < 400;
      await sql`INSERT INTO runtime_evidence_bundles (task_id, bundle_type, collected_by, after_state, artifacts, validation) VALUES (${taskId}, 'integration', ${ROLE}, ${sql.json({ service, endpoint, status, hash, length: responseLen })}, ${sql.json([{ type: "http_response", uri: endpoint, hash, mime_type: "application/json" }])}, ${sql.json({ passed, checks: ["reachable", "status_2xx"], notes: null })})`;

      if (passed) { await bump("integration_wirings_completed"); await bump("agent_actions_integration_agent_external"); await bump("evidence_bundles_collected"); }
      await audit(taskId, "wire", { service, endpoint, status, is_paid: isPaid }, { hash, length: responseLen }, passed ? null : "external_dependency_unavailable");

      return json({ task_id: taskId, agent_role: ROLE, status: passed ? "ok" : "failed", effect: { type: "external_call", summary: passed ? `wired ${service}` : `failed ${service}`, artifacts: [hash] }, evidence: { after_state: { service, endpoint, status }, checksums: [hash], log_refs: [taskId], screenshots: [] }, next_step: passed ? "register_for_use" : "retry_with_backoff", error_if_any: passed ? null : { code: "external_dependency_unavailable", message: `status ${status}`, details: null }, timestamp: new Date().toISOString() });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/wire"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
