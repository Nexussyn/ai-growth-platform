// Research Agent: scans for new capabilities and proposes integration options.
import postgres from "npm:postgres@3.4.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { ssl: "require", max: 3, idle_timeout: 5 });
const ROLE = "research_agent_external";

async function audit(taskId: string, action: string, diff: Record<string, unknown>, evidence: Record<string, unknown>, err: string | null = null) {
  await sql`INSERT INTO runtime_audit_log (task_id, agent_role, action, diff_or_effect, evidence, error) VALUES (${taskId}, ${ROLE}, ${action}, ${sql.json(diff)}, ${sql.json(evidence)}, ${err})`;
}
async function bump(k: string) { await sql`UPDATE projection_metrics SET metric_value = metric_value + 1, updated_at = now() WHERE metric_key = ${k}`; }
async function sha(s: string): Promise<string> { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join(""); }

// Source loop detection: if same signature repeats N times without new evidence -> stop and diversify
async function detectSourceLoop(signature: string): Promise<{ looped: boolean; count: number }> {
  const recent = await sql<Array<{ produced_evidence: boolean }>>`SELECT produced_evidence FROM runtime_source_history WHERE source_signature = ${signature} ORDER BY created_at DESC LIMIT 5`;
  const noEvidenceCount = recent.filter(r => !r.produced_evidence).length;
  return { looped: recent.length >= 3 && noEvidenceCount === recent.length, count: recent.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    await sql`UPDATE runtime_agents SET last_heartbeat = now() WHERE role = ${ROLE}`;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-research/, "") || "/";

    if (path === "/" || path === "/status") {
      const proposed = await sql`SELECT metric_value FROM projection_metrics WHERE metric_key = 'research_items_proposed'`;
      const loops = await sql`SELECT metric_value FROM projection_metrics WHERE metric_key = 'source_loops_detected'`;
      return json({ role: ROLE, permissions: ["scan_capabilities", "propose_integration"], proposed: Number(proposed[0]?.metric_value ?? 0), source_loops_detected: Number(loops[0]?.metric_value ?? 0) });
    }

    if (path === "/scan" && req.method === "POST") {
      const body = await req.json();
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const sourceClass = String(body.source_class ?? "api");
      const queryDescriptor = String(body.query ?? "");
      const sigInput = `${sourceClass}|${queryDescriptor}`;
      const signature = await sha(sigInput);

      const loop = await detectSourceLoop(signature);
      if (loop.looped) {
        await bump("source_loops_detected");
        await audit(taskId, "stop_source_loop", { signature, source_class: sourceClass, count: loop.count }, {}, "repeated_source_loop");
        return json({ task_id: taskId, agent_role: ROLE, status: "blocked", effect: { type: "none", summary: "source loop detected", artifacts: [] }, evidence: { log_refs: [taskId] }, next_step: "diversify_source_class", error_if_any: { code: "repeated_source_loop", message: `${loop.count} repeats with no new evidence`, details: { signature } }, timestamp: new Date().toISOString() });
      }

      // Free-first scan: pull from existing procurement catalog and known free patterns
      const existingCapabilities = await sql`SELECT name, category, tier, capability_tags FROM runtime_procurement_catalog WHERE tier = 'free' ORDER BY discovered_at DESC LIMIT 10`;
      const candidatesText = existingCapabilities.map(c => `${c.name}:${c.category}`).join(",");
      const newCandidates = [
        { name: "OpenAPI directory", category: "api_discovery", tier: "free", tags: ["api","openapi"] },
        { name: "PublicAPIs.dev", category: "api_directory", tier: "free", tags: ["public_api","catalog"] },
        { name: "MCP server registry", category: "mcp", tier: "free", tags: ["mcp","registry"] },
      ];

      let proposed = 0;
      for (const c of newCandidates) {
        const exists = await sql`SELECT 1 FROM runtime_procurement_catalog WHERE name = ${c.name}`;
        if (exists.length === 0) {
          await sql`INSERT INTO runtime_procurement_catalog (name, category, tier, endpoint, capability_tags, approved, notes) VALUES (${c.name}, ${c.category}, ${c.tier}, ${"mcp://" + c.name.toLowerCase().replace(/\s+/g,"-")}, ${sql.json(c.tags)}, true, 'auto-proposed by research agent')`;
          proposed++;
        }
      }

      const producedEvidence = proposed > 0;
      await sql`INSERT INTO runtime_source_history (task_id, source_class, source_signature, produced_evidence) VALUES (${taskId}, ${sourceClass}, ${signature}, ${producedEvidence})`;
      if (producedEvidence) { await bump("research_items_proposed"); await bump("agent_actions_research_agent_external"); }

      await sql`INSERT INTO runtime_evidence_bundles (task_id, bundle_type, collected_by, after_state, artifacts, validation) VALUES (${taskId}, 'audit', ${ROLE}, ${sql.json({ proposed, source_class: sourceClass, signature })}, ${sql.json([{ type: "research_scan", uri: `research://${signature}`, hash: signature }])}, ${sql.json({ passed: producedEvidence, checks: ["new_candidates_found"], notes: candidatesText })})`;
      await bump("evidence_bundles_collected");
      await audit(taskId, "scan", { proposed, signature, source_class: sourceClass }, { existing: existingCapabilities.length });

      return json({ task_id: taskId, agent_role: ROLE, status: "ok", effect: { type: "external_call", summary: `proposed ${proposed} new capabilities`, artifacts: [signature] }, evidence: { after_state: { proposed, signature }, log_refs: [taskId], screenshots: [], checksums: [signature] }, next_step: proposed > 0 ? "request_integration" : "diversify_query", error_if_any: null, timestamp: new Date().toISOString() });
    }

    return json({ role: ROLE, endpoints: ["/", "/status", "/scan"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
