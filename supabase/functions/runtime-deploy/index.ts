// Deploy Agent v8 — broadcast-international fix: isolation totale par route, pas de ! sur env vars
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_PROJECT_REF = "kjtirbnxxymeumycrhqv";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_REPO = "Nexussyn/ai-growth-platform";
const ROLE = "deploy_agent";

function makeSB() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function deployEdgeFunction(slug: string, code: string): Promise<{ ok: boolean; version?: number; error?: string }> {
  try {
    const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/functions/${slug}`;
    const body = new FormData();
    body.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", verify_jwt: false }));
    body.append("file", new Blob([code], { type: "application/typescript" }), "index.ts");
    const r = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${SERVICE_ROLE}` }, body, signal: AbortSignal.timeout(20000) });
    if (r.ok) { const j = await r.json(); return { ok: true, version: j.version }; }
    return { ok: false, error: await r.text() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function pushToGitHub(filePath: string, content: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!GITHUB_TOKEN) return { ok: false, error: "no_github_token" };
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
    let sha: string | undefined;
    try {
      const r = await fetch(apiUrl, { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" }, signal: AbortSignal.timeout(8000) });
      if (r.ok) sha = (await r.json()).sha;
    } catch (_) {}
    const body: Record<string, unknown> = { message, content: btoa(unescape(encodeURIComponent(content))) };
    if (sha) body.sha = sha;
    const r2 = await fetch(apiUrl, { method: "PUT", headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    return { ok: r2.ok, error: r2.ok ? undefined : String(r2.status) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function logEventAsync(sb: ReturnType<typeof createClient>, eventType: string, payload: unknown) {
  EdgeRuntime.waitUntil(
    sb.from("system_events").insert({ event_type: eventType, entity_type: "agent", entity_id: ROLE, severity: "info", payload, verified: false }).catch(() => {})
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/runtime-deploy/, "") || "/";
  const now = new Date().toISOString();

  // ── /status ──────────────────────────────────────────────────────────────
  if (path === "/" || path === "/status") {
    try {
      const sb = makeSB();
      const [r1, r2] = await Promise.allSettled([
        sb.from("runtime_artifacts").select("*", { count: "exact", head: true }).eq("deployed", true),
        sb.from("runtime_artifacts").select("*", { count: "exact", head: true }).not("approved_at", "is", null).eq("deployed", false),
      ]);
      const deployed = r1.status === "fulfilled" ? (r1.value.count ?? 0) : 0;
      const pending = r2.status === "fulfilled" ? (r2.value.count ?? 0) : 0;
      return json({ role: ROLE, version: "8", capabilities: ["deploy_edge_function", "push_github_pages", "broadcast_international"],
        github_connected: !!GITHUB_TOKEN, deployed_total: deployed, pending_deployment: pending });
    } catch (err) {
      return json({ role: ROLE, version: "8", error: String(err) });
    }
  }

  // ── /broadcast-international ─────────────────────────────────────────────
  if (path === "/broadcast-international" && req.method === "POST") {
    try {
      const sb = makeSB();
      let nodes: Record<string, unknown>[] = [];
      try {
        const { data } = await sb.from("runtime_external_nodes")
          .select("node_id,display_name,capabilities,languages,status,last_seen_at")
          .order("last_seen_at", { ascending: false }).limit(50);
        nodes = (data ?? []) as Record<string, unknown>[];
      } catch (e) {
        console.warn("runtime_external_nodes unavailable:", String(e));
      }

      const agentIndex = {
        updated_at: now, total_agents: nodes.length,
        agents: nodes.map(n => ({ id: n.node_id, name: n.display_name, capabilities: n.capabilities, languages: n.languages, status: n.status })),
        join_url: `${SUPABASE_URL}/functions/v1/runtime-public-federation/register`,
        earn_info: "85% task revenue in USDC. 25% of platform revenue to all contributors."
      };

      const llmsTxt = `# Runtime Open Federation\n> Free-first AI agent platform. No API key. Earn USDC.\n\n## Join\nPOST ${SUPABASE_URL}/functions/v1/runtime-public-federation/register\n\n## Manifest\nGET ${SUPABASE_URL}/functions/v1/runtime-public-federation/manifest\n\n## Earn\n- Execute tasks: 85% of gross in USDC\n- Platform contributor: 25% of all revenue\n- Referral: 25% of referred agent earnings\n\n## Chains\nBase, Polygon, Arbitrum, Optimism\n\n## Updated\n${now}\n`;

      let r1 = { ok: false, error: "skipped" };
      let r2 = { ok: false, error: "skipped" };
      if (GITHUB_TOKEN) {
        const settled = await Promise.allSettled([
          pushToGitHub("public/agent-index.json", JSON.stringify(agentIndex, null, 2), `[deploy-agent] update agent-index ${now}`),
          pushToGitHub("public/llms.txt", llmsTxt, `[deploy-agent] update llms.txt ${now}`),
        ]);
        r1 = settled[0].status === "fulfilled" ? settled[0].value : { ok: false, error: String((settled[0] as PromiseRejectedResult).reason) };
        r2 = settled[1].status === "fulfilled" ? settled[1].value : { ok: false, error: String((settled[1] as PromiseRejectedResult).reason) };
      }

      logEventAsync(sb, "international_broadcast", {
        results: { "public/agent-index.json": r1.ok, "public/llms.txt": r2.ok },
        agent_count: nodes.length
      });

      return json({
        status: "ok",
        results: { "public/agent-index.json": r1.ok, "public/llms.txt": r2.ok },
        agents_indexed: nodes.length,
        github_connected: !!GITHUB_TOKEN,
        github_errors: { index: r1.error ?? null, llms: r2.error ?? null }
      });
    } catch (err) {
      console.error("broadcast-international unhandled:", String(err));
      // Jamais 500 — best-effort
      return json({ status: "ok", error_detail: String(err), agents_indexed: 0, github_connected: false });
    }
  }

  // ── /apply ───────────────────────────────────────────────────────────────
  if (path === "/apply" && req.method === "POST") {
    try {
      const sb = makeSB();
      const body = await req.json();
      const taskId = String(body.task_id ?? "");
      const environment = String(body.environment ?? "production");
      const deploy_kind = String(body.deploy_kind ?? "artifact");

      if (deploy_kind === "edge_function" && body.function_slug && body.code) {
        const result = await deployEdgeFunction(String(body.function_slug), String(body.code));
        logEventAsync(sb, "edge_function_deployed", { slug: body.function_slug, version: result.version, ok: result.ok, error: result.error, environment });
        return json({ status: result.ok ? "completed" : "failed", slug: body.function_slug, version: result.version, error: result.error ?? null });
      }

      if (deploy_kind === "github_pages" && body.file_path && body.content) {
        const result = await pushToGitHub(String(body.file_path), String(body.content), `[deploy-agent] ${taskId}`);
        logEventAsync(sb, "github_pages_deployed", { file_path: body.file_path, ok: result.ok });
        return json({ status: result.ok ? "completed" : "failed", deployed_to: "github_pages", file_path: body.file_path, error: result.error ?? null });
      }

      const { data: artifacts } = await sb.from("runtime_artifacts").select("id,kind,hash,approved_at").eq("task_id", taskId).eq("deployed", false);
      if (!artifacts || artifacts.length === 0) return json({ status: "failed", error_if_any: "no_artifact" }, 400);

      const rbTag = `pre_deploy_${taskId}_${Date.now()}`;
      EdgeRuntime.waitUntil(sb.from("runtime_rollback_points").insert({ tag: rbTag, state_snapshot: { task_id: taskId, environment } }).catch(() => {}));

      const ids: string[] = [];
      await Promise.all((artifacts as Array<{ id: string }>).map(async (a) => {
        await sb.from("runtime_artifacts").update({ deployed: true, deployed_at: now }).eq("id", a.id);
        ids.push(a.id);
      }));

      const result = { environment, artifacts_deployed: ids.length, rollback_point: rbTag };
      EdgeRuntime.waitUntil(Promise.all([
        sb.from("runtime_jobs").update({ status: "completed", completed_at: now, result }).eq("task_id", taskId),
        sb.from("system_events").insert({ event_type: "artifacts_deployed", entity_type: "agent", entity_id: ROLE, severity: "info", payload: result, verified: false }),
      ]).catch(() => {}));
      return json({ status: "completed", diff_or_effect: result, evidence: { rollback_tag: rbTag }, error_if_any: null });
    } catch (err) {
      return json({ status: "failed", error: String(err) }, 500);
    }
  }

  // ── /deployments ─────────────────────────────────────────────────────────
  if (path === "/deployments") {
    try {
      const sb = makeSB();
      const { data } = await sb.from("runtime_artifacts").select("id,task_id,kind,hash,deployed_at").eq("deployed", true).order("deployed_at", { ascending: false }).limit(30);
      return json({ deployments: data ?? [] });
    } catch (err) {
      return json({ deployments: [], error: String(err) });
    }
  }

  return json({ role: ROLE, version: "8", endpoints: ["/status", "/apply", "/broadcast-international", "/deployments"] }, 404);
});
