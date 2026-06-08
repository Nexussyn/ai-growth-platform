// Finance Agent: controls spend, budget thresholds, and free-to-paid transition.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "finance_agent_external";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}
async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-finance/, "") || "/";

    if (path === "/" || path === "/status") {
      const b = await sql`SELECT * FROM runtime_budget WHERE id = 1`;
      const externalCalls = await sql`SELECT count(*) as c, coalesce(sum(cost_cents),0) as total_cost FROM runtime_external_calls WHERE is_paid = true`;
      return json({ role: ROLE, permissions: ["budget_control", "unlock_paid"], budget: b[0], paid_calls_total: Number(externalCalls[0].c), paid_spend_cents: Number(externalCalls[0].total_cost), free_first_policy_enabled: !b[0].paid_unlocked });
    }

    if (path === "/record-revenue" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const cents = Number(body.amount_cents ?? 0);
      const source = String(body.source ?? "");
      const evidence = body.evidence ?? {};
      if (cents <= 0) return json({ task_id: taskId, agent_role: ROLE, status: "failed", effect: { type: "none", summary: "invalid amount", artifacts: [] }, evidence: {}, next_step: null, error_if_any: { code: "invalid_payload", message: "amount_cents must be > 0", details: null }, timestamp: new Date().toISOString() }, 400);
      if (!source || Object.keys(evidence).length === 0) return json({ task_id: taskId, agent_role: ROLE, status: "failed", effect: { type: "none", summary: "missing evidence", artifacts: [] }, evidence: {}, next_step: null, error_if_any: { code: "missing_external_evidence", message: "source and evidence required", details: null }, timestamp: new Date().toISOString() }, 400);

      await sql`UPDATE runtime_budget SET total_revenue_cents = total_revenue_cents + ${cents}, updated_at = now() WHERE id = 1`;
      await audit(taskId, "record_revenue", { cents, source }, evidence as Record<string, unknown>);
      await sql`INSERT INTO runtime_evidence_bundles (task_id, bundle_type, collected_by, after_state, artifacts, validation) VALUES (${taskId}, 'audit', ${ROLE}, ${sql.json({ cents, source })}, ${sql.json([{ type: "revenue_record", uri: `revenue://${source}`, hash: null }])}, ${sql.json({ passed: true, checks: ["evidence_present"], notes: null })})`;
      await bump("evidence_bundles_collected");
      await bump("agent_actions_finance_agent_external");
      const updated = await sql`SELECT total_revenue_cents FROM runtime_budget WHERE id = 1`;
      return json({ task_id: taskId, agent_role: ROLE, status: "ok", effect: { type: "db_write", summary: `recorded $${(cents/100).toFixed(2)}`, artifacts: [] }, evidence: { after_state: { total_revenue_cents: updated[0].total_revenue_cents }, log_refs: [taskId], screenshots: [], checksums: [] }, next_step: "evaluate_paid_unlock", error_if_any: null, timestamp: new Date().toISOString() });
    }

    if (path === "/unlock-paid" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const monthlyCap = Number(body.monthly_cap_cents ?? 0);
      const expectedRoi = Number(body.expected_roi ?? 0); // ratio: revenue / spend
      const securityApproved = Boolean(body.security_approved ?? false);
      const reason = String(body.reason ?? "");

      await bump("paid_intelligence_unlock_attempts");

      const b = await sql`SELECT total_revenue_cents, paid_unlocked FROM runtime_budget WHERE id = 1`;
      const totalRevenue = Number(b[0].total_revenue_cents);
      const policyChecks = [
        { name: "real_revenue_exists", result: totalRevenue > 0 ? "pass" : "fail", reason: totalRevenue > 0 ? null : "no revenue recorded" },
        { name: "security_approved_for_paid", result: securityApproved ? "pass" : "fail", reason: securityApproved ? null : "security approval missing" },
        { name: "expected_roi_positive", result: expectedRoi > 1.0 ? "pass" : "fail", reason: expectedRoi > 1.0 ? null : `roi ${expectedRoi} <= 1.0` },
        { name: "monthly_cap_set", result: monthlyCap > 0 ? "pass" : "fail", reason: monthlyCap > 0 ? null : "no spending cap" },
      ];
      const allPass = policyChecks.every(c => c.result === "pass");

      if (!allPass) {
        await audit(taskId, "unlock_denied", { policy_checks: policyChecks, expected_roi: expectedRoi, monthly_cap: monthlyCap }, { revenue: totalRevenue }, "unauthorized_spend");
        return json({ task_id: taskId, agent_role: ROLE, status: "blocked", effect: { type: "none", summary: "unlock denied", artifacts: [] }, evidence: { after_state: { paid_unlocked: false, policy_checks: policyChecks }, log_refs: [taskId], screenshots: [], checksums: [] }, next_step: "satisfy_unlock_policy", error_if_any: { code: "unauthorized_spend", message: "policy checks failed", details: { policy_checks: policyChecks } }, timestamp: new Date().toISOString() });
      }

      await sql`UPDATE runtime_budget SET paid_unlocked = true, finance_approved = true, security_approved_for_paid = ${securityApproved}, monthly_cap_cents = ${monthlyCap}, unlocked_at = now(), unlocked_reason = ${reason}, updated_at = now() WHERE id = 1`;
      await bump("paid_intelligence_unlocks");
      await audit(taskId, "unlock_paid", { policy_checks: policyChecks, monthly_cap: monthlyCap, reason }, { revenue: totalRevenue });
      return json({ task_id: taskId, agent_role: ROLE, status: "ok", effect: { type: "db_write", summary: "paid intelligence unlocked", artifacts: [] }, evidence: { after_state: { paid_unlocked: true, monthly_cap, policy_checks: policyChecks }, log_refs: [taskId], screenshots: [], checksums: [] }, next_step: "enable_paid_routes", error_if_any: null, timestamp: new Date().toISOString() });
    }

    if (path === "/revoke" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const reason = String(body.reason ?? "manual_revoke");
      await sql`UPDATE runtime_budget SET paid_unlocked = false, unlocked_reason = ${reason}, updated_at = now() WHERE id = 1`;
      await audit(taskId, "revoke_paid", { reason }, {});
      return json({ task_id: taskId, status: "ok", revoked: true, reason });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/record-revenue", "/unlock-paid", "/revoke"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
