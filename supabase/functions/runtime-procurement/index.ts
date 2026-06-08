// Procurement Agent: catalogs vendors, MCP servers, and tools (free-first).
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "procurement_agent_external";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}
async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-procurement/, "") || "/";

    if (path === "/" || path === "/status") {
      const free = await sql`SELECT count(*) as c FROM runtime_procurement_catalog WHERE tier = 'free'`;
      const paid = await sql`SELECT count(*) as c FROM runtime_procurement_catalog WHERE tier = 'paid'`;
      const approved = await sql`SELECT count(*) as c FROM runtime_procurement_catalog WHERE approved = true`;
      return json({ role: ROLE, permissions: ["catalog_vendors", "find_mcp"], free_items: Number(free[0].c), paid_items: Number(paid[0].c), approved_items: Number(approved[0].c) });
    }

    if (path === "/catalog") {
      const tier = url.searchParams.get("tier");
      const rows = tier ? await sql`SELECT name, category, tier, endpoint, monthly_cost_cents, capability_tags, approved FROM runtime_procurement_catalog WHERE tier = ${tier} ORDER BY name` : await sql`SELECT name, category, tier, endpoint, monthly_cost_cents, capability_tags, approved FROM runtime_procurement_catalog ORDER BY tier, name`;
      return json({ catalog: rows });
    }

    if (path === "/add" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const name = String(body.name ?? "");
      const category = String(body.category ?? "other");
      const tier = String(body.tier ?? "free");
      const endpoint = String(body.endpoint ?? "");
      const monthlyCost = Number(body.monthly_cost_cents ?? 0);
      const tags = Array.isArray(body.capability_tags) ? body.capability_tags : [];

      if (!name || !endpoint) return json({ task_id: taskId, agent_role: ROLE, status: "failed", effect: { type: "none", summary: "missing fields", artifacts: [] }, evidence: {}, next_step: null, error_if_any: { code: "invalid_payload", message: "name and endpoint required", details: null }, timestamp: new Date().toISOString() }, 400);

      // Free-first policy: paid items require finance approval before approval
      const approved = tier === "free";
      if (tier === "paid") {
        const budget = await sql`SELECT paid_unlocked FROM runtime_budget WHERE id = 1`;
        if (!budget[0].paid_unlocked) {
          await sql`INSERT INTO runtime_procurement_catalog (name, category, tier, endpoint, monthly_cost_cents, capability_tags, approved, notes) VALUES (${name}, ${category}, ${tier}, ${endpoint}, ${monthlyCost}, ${sql.json(tags)}, false, 'awaiting paid unlock')`;
          await audit(taskId, "catalog_pending_paid", { name, tier, monthly_cost: monthlyCost }, { reason: "paid_locked" });
          return json({ task_id: taskId, agent_role: ROLE, status: "blocked", effect: { type: "none", summary: "cataloged but paid_locked", artifacts: [name] }, evidence: { after_state: { name, tier, approved: false }, log_refs: [taskId], screenshots: [], checksums: [] }, next_step: "request_finance_approval", error_if_any: { code: "unauthorized_spend", message: "paid intelligence locked", details: null }, timestamp: new Date().toISOString() });
        }
      }

      await sql`INSERT INTO runtime_procurement_catalog (name, category, tier, endpoint, monthly_cost_cents, capability_tags, approved, notes) VALUES (${name}, ${category}, ${tier}, ${endpoint}, ${monthlyCost}, ${sql.json(tags)}, ${approved}, '')`;
      await bump("procurement_items_cataloged");
      await bump("agent_actions_procurement_agent_external");
      await audit(taskId, "catalog_add", { name, category, tier, endpoint, approved }, { tags });

      return json({ task_id: taskId, agent_role: ROLE, status: "ok", effect: { type: "external_call", summary: `cataloged ${name} (${tier})`, artifacts: [name] }, evidence: { after_state: { name, tier, approved }, log_refs: [taskId], screenshots: [], checksums: [] }, next_step: approved ? "ready_for_integration" : "awaiting_approval", error_if_any: null, timestamp: new Date().toISOString() });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/catalog", "/add"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
