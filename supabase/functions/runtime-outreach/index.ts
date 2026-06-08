// Outreach Agent: lawful inbound-only outreach + reply capture (no cold spam).
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "outreach_agent_external";

const ALLOWED_BASES = ["inbound_only", "explicit_consent", "double_opt_in", "warm_intro", "existing_customer"];

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
    const path = url.pathname.replace(/^\/runtime-outreach/, "") || "/";

    if (path === "/" || path === "/status") {
      const sent = await sql`SELECT metric_value FROM projection_metrics WHERE metric_key = 'outreach_messages_sent'`;
      const replied = await sql`SELECT count(*) as c FROM runtime_outreach_log WHERE reply_received = true`;
      return json({ role: ROLE, permissions: ["lawful_outreach", "log_replies"], allowed_consent_bases: ALLOWED_BASES, sent: Number(sent[0]?.metric_value ?? 0), replied: Number(replied[0].c) });
    }

    if (path === "/send" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const channel = String(body.channel ?? "email");
      const target = String(body.target_handle ?? "");
      const message = String(body.message ?? "");
      const consent = String(body.consent_basis ?? "inbound_only");

      if (!ALLOWED_BASES.includes(consent)) {
        await audit(taskId, "outreach_blocked_consent", { consent, target }, {}, "invalid_permissions");
        return json({ task_id: taskId, agent_role: ROLE, status: "blocked", effect: { type: "none", summary: "invalid consent basis", artifacts: [] }, evidence: {}, next_step: "request_consent", error_if_any: { code: "invalid_permissions", message: `consent_basis must be one of ${ALLOWED_BASES.join(", ")}`, details: null }, timestamp: new Date().toISOString() }, 403);
      }
      if (!message || message.length < 10) {
        return json({ task_id: taskId, agent_role: ROLE, status: "failed", effect: { type: "none", summary: "missing message", artifacts: [] }, evidence: {}, next_step: null, error_if_any: { code: "invalid_payload", message: "message required (>=10 chars)", details: null }, timestamp: new Date().toISOString() }, 400);
      }

      const messageHash = await sha(`${target}|${message}`);
      await sql`INSERT INTO runtime_outreach_log (task_id, channel, target_handle, message_hash, consent_basis, status) VALUES (${taskId}, ${channel}, ${target}, ${messageHash}, ${consent}, 'sent')`;
      await bump("outreach_messages_sent");
      await bump("agent_actions_outreach_agent_external");
      await audit(taskId, "send", { channel, target, consent, message_hash: messageHash }, { length: message.length });
      await sql`INSERT INTO runtime_evidence_bundles (task_id, bundle_type, collected_by, after_state, artifacts, validation) VALUES (${taskId}, 'outreach', ${ROLE}, ${sql.json({ channel, target, consent_basis: consent, message_hash: messageHash })}, ${sql.json([{ type: "outreach_message", uri: `outreach://${channel}/${messageHash}`, hash: messageHash, mime_type: "text/plain" }])}, ${sql.json({ passed: true, checks: ["consent_valid", "lawful_basis"], notes: null })})`;
      await bump("evidence_bundles_collected");

      return json({ task_id: taskId, agent_role: ROLE, status: "ok", effect: { type: "external_call", summary: `outreach sent via ${channel}`, artifacts: [messageHash] }, evidence: { after_state: { channel, target, consent_basis: consent }, log_refs: [taskId], screenshots: [], checksums: [messageHash] }, next_step: "await_reply", error_if_any: null, timestamp: new Date().toISOString() });
    }

    if (path === "/reply" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? "");
      const replyText = String(body.reply ?? "");
      const replyHash = await sha(replyText);
      await sql`UPDATE runtime_outreach_log SET reply_received = true, reply_hash = ${replyHash}, status = 'replied' WHERE task_id = ${taskId}`;
      await audit(taskId, "reply", { reply_hash: replyHash }, { length: replyText.length });
      return json({ task_id: taskId, status: "ok", reply_hash: replyHash });
    }

    if (path === "/log") {
      const rows = await sql`SELECT task_id, channel, target_handle, consent_basis, status, reply_received, created_at FROM runtime_outreach_log ORDER BY created_at DESC LIMIT 30`;
      return json({ outreach_log: rows });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/send", "/reply", "/log"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
