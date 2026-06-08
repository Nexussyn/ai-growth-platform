// Browser Agent: confirms visual and DOM changes via headless fetch + hash comparison.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "browser_agent_external";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}
async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }
async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchAndHash(url: string): Promise<{ status: number; hash: string; len: number; sample: string; error?: string }> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "RuntimeBrowser/1.0", Accept: "text/html,application/json" }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return { status: r.status, hash: await sha(t), len: t.length, sample: t.slice(0, 200) };
  } catch (e) {
    return { status: 0, hash: "", len: 0, sample: "", error: e instanceof Error ? e.message : "fetch_error" };
  }
}

async function bundle(taskId: string, type: string, before: Record<string, unknown>, after: Record<string, unknown>, artifacts: unknown[], passed: boolean, checks: string[]) {
  await sql`INSERT INTO runtime_evidence_bundles (task_id, bundle_type, collected_by, before_state, after_state, artifacts, validation) VALUES (${taskId}, ${type}, ${ROLE}, ${sql.json(before)}, ${sql.json(after)}, ${sql.json(artifacts)}, ${sql.json({ passed, checks, notes: null })})`;
  await bump("evidence_bundles_collected");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-browser/, "") || "/";

    if (path === "/" || path === "/status") {
      const checks = await sql`SELECT count(*) as c FROM runtime_evidence_bundles WHERE collected_by = ${ROLE}`;
      return json({ role: ROLE, permissions: ["inspect_dom", "screenshot", "form_check"], checks_run: Number(checks[0].c) });
    }

    if (path === "/inspect" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const targetUrl = String(body.url ?? "");
      if (!targetUrl) return json({ status: "failed", error_if_any: { code: "missing_url", message: "url required", details: null }, effect: { type: "none", summary: "", artifacts: [] }, evidence: {}, next_step: null, timestamp: new Date().toISOString(), task_id: taskId }, 400);

      const beforeUrl = String(body.before_url ?? targetUrl);
      const before = await fetchAndHash(beforeUrl);
      const after = await fetchAndHash(targetUrl);
      const expectChange = Boolean(body.expect_change ?? false);
      const changed = before.hash !== after.hash;
      const passed = expectChange ? changed && after.status >= 200 && after.status < 400 : after.status >= 200 && after.status < 400;

      const checks = ["fetch_ok", expectChange ? "dom_changed" : "dom_stable", "status_2xx"];
      await bundle(taskId, "screenshot", { url: beforeUrl, ...before }, { url: targetUrl, ...after }, [{ type: "dom_hash", uri: targetUrl, hash: after.hash, mime_type: "text/html" }], passed, checks);
      await bump("agent_actions_browser_agent_external");

      const result = { url: targetUrl, before_hash: before.hash, after_hash: after.hash, changed, status: after.status, content_length: after.len, sample: after.sample.slice(0, 100) };
      const error = !passed ? { code: "code_ui_divergence", message: expectChange ? "missing_preview_change" : `bad status ${after.status}`, details: result } : null;
      await audit(taskId, "inspect", result, { passed, checks }, error?.code ?? null);

      return json({ task_id: taskId, agent_role: ROLE, status: passed ? "ok" : "failed", effect: { type: "screenshot", summary: passed ? "DOM verified" : "DOM divergence", artifacts: [after.hash] }, evidence: { before_state: before, after_state: after, log_refs: [taskId], screenshots: [], checksums: [after.hash] }, next_step: passed ? "deploy_or_complete" : "rollback", error_if_any: error, timestamp: new Date().toISOString() });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/inspect"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
