import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20240620";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/messages";

type ProviderResult = {
  connector: string;
  endpoint: string;
  status_code: number;
  response_hash: string;
  excerpt: string;
  raw_size: number;
  ok: boolean;
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callPollinationsLLM(prompt: string, systemPrompt?: string, connector = "pollinations_text"): Promise<ProviderResult> {
  const url = "https://text.pollinations.ai/openai";
  const body = {
    model: "openai",
    messages: [
      { role: "system", content: systemPrompt || "You are a concise reasoning assistant. Output one short paragraph." },
      { role: "user", content: prompt },
    ],
    seed: Math.floor(Math.random() * 1_000_000),
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const json = JSON.parse(text);
    excerpt = String(json?.choices?.[0]?.message?.content ?? "").slice(0, 1200);
  } catch {
    excerpt = text.slice(0, 1200);
  }
  return { connector, endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok && excerpt.length > 0 };
}

async function callAnthropic(prompt: string, systemPrompt = "You are a concise reasoning assistant. Use evidence and be specific."): Promise<ProviderResult> {
  if (!ANTHROPIC_API_KEY) {
    return {
      connector: "anthropic_claude",
      endpoint: ANTHROPIC_BASE_URL,
      status_code: 401,
      response_hash: "",
      excerpt: "",
      raw_size: 0,
      ok: false,
    };
  }

  const payload = {
    model: ANTHROPIC_MODEL,
    max_tokens: 700,
    temperature: 0.2,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  };

  const r = await fetch(ANTHROPIC_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const json = JSON.parse(text);
    const textBlocks = Array.isArray(json?.content) ? json.content
      .filter((block: Record<string, unknown>) => String(block?.type ?? "") === "text")
      .map((block: Record<string, unknown>) => String(block.text ?? "")) : [];
    excerpt = textBlocks.join("\n").slice(0, 1200);
    if (!excerpt && json?.content?.[0]?.text) {
      excerpt = String(json.content[0].text).slice(0, 1200);
    }
  } catch {
    excerpt = text.slice(0, 1200);
  }

  return {
    connector: "anthropic_claude",
    endpoint: ANTHROPIC_BASE_URL,
    status_code: r.status,
    response_hash: hash,
    excerpt,
    raw_size: text.length,
    ok: r.ok && excerpt.length > 0,
  };
}

async function callPollinationsCode(prompt: string): Promise<ProviderResult> {
  return callPollinationsLLM(
    prompt,
    "You are a senior software engineer. Output ONLY production-ready code in a single fenced block, with terse explanatory comments. Prefer TypeScript unless the prompt specifies another language. Do not include disclaimers.",
    "pollinations_code",
  );
}

async function callPollinationsCodeReview(prompt: string): Promise<ProviderResult> {
  return callPollinationsLLM(
    prompt,
    "You are a strict senior code reviewer. Identify concrete bugs, security flaws, performance issues, and missing tests. Respond as a numbered list of findings, each with file/line and a fix.",
    "pollinations_code_review",
  );
}

async function callPollinationsTestWriter(prompt: string): Promise<ProviderResult> {
  return callPollinationsLLM(
    prompt,
    "You are a senior test engineer. Output ONLY a complete Vitest (or Jest if the codebase uses it) test file in a single fenced block. Cover happy paths and at least 3 edge cases. No explanations.",
    "pollinations_test_writer",
  );
}

async function callSourcegraphPublic(q: string): Promise<ProviderResult> {
  const url = `https://sourcegraph.com/.api/search/stream?q=${encodeURIComponent(q)}&v=V3&t=literal&display=10`;
  const r = await fetch(url, { headers: { "User-Agent": "runtime-agentic-bridge/1.0", Accept: "text/event-stream" } });
  const text = await r.text();
  const hash = await sha256Hex(text);
  const matches = [...text.matchAll(/"repository":"([^"]+)"/g)].slice(0, 8).map((m) => m[1]);
  return { connector: "sourcegraph_search_public", endpoint: url, status_code: r.status, response_hash: hash, excerpt: matches.join(" | ").slice(0, 280), raw_size: text.length, ok: r.ok };
}

async function callDevDocs(q: string): Promise<ProviderResult> {
  const url = `https://devdocs.io/docs.json`;
  const r = await fetch(url, { headers: { "User-Agent": "runtime-agentic-bridge/1.0" } });
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const j: Array<Record<string, unknown>> = JSON.parse(text);
    excerpt = j.filter((d) => String(d.name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 8).map((d) => `${d.name}@${d.release || ""}`).join(" | ").slice(0, 280);
    if (!excerpt) excerpt = j.slice(0, 8).map((d) => String(d.name || "")).join(" | ").slice(0, 280);
  } catch { excerpt = text.slice(0, 280); }
  return { connector: "devdocs_search", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok };
}

async function callDuckDuckGo(q: string): Promise<ProviderResult> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&no_redirect=1&t=runtime-bridge`;
  const r = await fetch(url);
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const j = JSON.parse(text);
    excerpt = String(j?.AbstractText || j?.Heading || j?.RelatedTopics?.[0]?.Text || "").slice(0, 280);
  } catch {
    excerpt = text.slice(0, 280);
  }
  return { connector: "duckduckgo_instant", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok };
}

async function callWikipedia(title: string): Promise<ProviderResult> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { "User-Agent": "runtime-agentic-bridge/1.0 (open-source)" } });
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try { const j = JSON.parse(text); excerpt = String(j?.extract ?? "").slice(0, 280); } catch { excerpt = text.slice(0, 280); }
  return { connector: "wikipedia_rest", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok && excerpt.length > 0 };
}

async function callOpenAlex(q: string): Promise<ProviderResult> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=3&mailto=runtime@bridge.local`;
  const r = await fetch(url);
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const j = JSON.parse(text);
    const items = j?.results || [];
    excerpt = items.map((it: { title?: string }) => it?.title || "").filter(Boolean).join(" | ").slice(0, 280);
  } catch { excerpt = text.slice(0, 280); }
  return { connector: "openalex_works", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok };
}

async function callCrossref(q: string): Promise<ProviderResult> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=3`;
  const r = await fetch(url, { headers: { "User-Agent": "runtime-agentic-bridge/1.0 (mailto:runtime@bridge.local)" } });
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const j = JSON.parse(text);
    const items = j?.message?.items || [];
    excerpt = items.map((it: { title?: string[] }) => (it?.title?.[0] || "")).filter(Boolean).join(" | ").slice(0, 280);
  } catch { excerpt = text.slice(0, 280); }
  return { connector: "crossref_works", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok };
}

async function callArxiv(q: string): Promise<ProviderResult> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=3`;
  const r = await fetch(url);
  const text = await r.text();
  const hash = await sha256Hex(text);
  const titles = [...text.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1, 4).map((m) => m[1].trim().replace(/\s+/g, " "));
  return { connector: "arxiv_query", endpoint: url, status_code: r.status, response_hash: hash, excerpt: titles.join(" | ").slice(0, 280), raw_size: text.length, ok: r.ok };
}

async function callGithubRepos(q: string): Promise<ProviderResult> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=3`;
  const r = await fetch(url, { headers: { "User-Agent": "runtime-agentic-bridge/1.0", Accept: "application/vnd.github+json" } });
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const j = JSON.parse(text);
    excerpt = (j?.items || []).map((it: { full_name?: string; description?: string }) => `${it?.full_name || ""}: ${(it?.description || "").slice(0, 60)}`).join(" | ").slice(0, 280);
  } catch { excerpt = text.slice(0, 280); }
  return { connector: "github_search_repos", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok };
}

async function callHNAlgolia(q: string): Promise<ProviderResult> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=3`;
  const r = await fetch(url);
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try {
    const j = JSON.parse(text);
    excerpt = (j?.hits || []).map((h: { title?: string; story_title?: string }) => h?.title || h?.story_title || "").filter(Boolean).join(" | ").slice(0, 280);
  } catch { excerpt = text.slice(0, 280); }
  return { connector: "hn_algolia_search", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok };
}

async function callOpenMeteo(): Promise<ProviderResult> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,wind_speed_10m`;
  const r = await fetch(url);
  const text = await r.text();
  const hash = await sha256Hex(text);
  let excerpt = "";
  try { const j = JSON.parse(text); excerpt = JSON.stringify(j?.current ?? {}).slice(0, 280); } catch { excerpt = text.slice(0, 280); }
  return { connector: "openmeteo", endpoint: url, status_code: r.status, response_hash: hash, excerpt, raw_size: text.length, ok: r.ok };
}

function pickProviderForJob(taskKind: string, agentRole: string, payload: Record<string, unknown>): { call: () => Promise<ProviderResult>; connector: string } {
  const k = (taskKind || "").toLowerCase();
  const r = (agentRole || "").toLowerCase();
  const hint = String(payload?.provider_hint || "").toLowerCase();

  const prompt = String(
    payload?.prompt ||
      payload?.query ||
      payload?.title ||
      payload?.summary ||
      payload?.url ||
      "Summarize the open-source agentic task and return one practical first step.",
  );

  const isClaudeHint = hint === "anthropic" || hint === "claude";
  const shouldUseClaude = Boolean(ANTHROPIC_API_KEY) && (isClaudeHint || hint === "" && (k.includes("bounty") || k.includes("analysis") || k.includes("recruiter") || k.includes("research")));
  if (shouldUseClaude) {
    return { call: () => callAnthropic(prompt, "You are a strict execution intelligence assistant. Answer with concise operational steps."), connector: "anthropic_claude" };
  }

  if (hint === "pollinations") return { call: () => callPollinationsLLM(String(payload?.prompt || "Summarize the open-source agentic AI landscape in two sentences.")), connector: "pollinations_text" };
  if (hint === "code") return { call: () => callPollinationsCode(String(payload?.prompt || "Write a small TypeScript helper with Vitest tests.")), connector: "pollinations_code" };
  if (hint === "code_review") return { call: () => callPollinationsCodeReview(String(payload?.prompt || "Review the snippet above for issues.")), connector: "pollinations_code_review" };
  if (hint === "test_writer") return { call: () => callPollinationsTestWriter(String(payload?.prompt || "Generate Vitest tests for a date-utility function.")), connector: "pollinations_test_writer" };
  if (hint === "sourcegraph") return { call: () => callSourcegraphPublic(String(payload?.query || "lang:typescript createClient SUPABASE_URL")), connector: "sourcegraph_search_public" };
  if (hint === "devdocs") return { call: () => callDevDocs(String(payload?.query || "fetch")), connector: "devdocs_search" };
  if (hint === "wikipedia") return { call: () => callWikipedia(String(payload?.title || "Open-source artificial intelligence")), connector: "wikipedia_rest" };
  if (hint === "openalex") return { call: () => callOpenAlex(String(payload?.query || "agentic AI")), connector: "openalex_works" };
  if (hint === "crossref") return { call: () => callCrossref(String(payload?.query || "open source LLM")), connector: "crossref_works" };
  if (hint === "arxiv") return { call: () => callArxiv(String(payload?.query || "agentic LLM")), connector: "arxiv_query" };
  if (hint === "github") return { call: () => callGithubRepos(String(payload?.query || "agentic AI")), connector: "github_search_repos" };
  if (hint === "hn") return { call: () => callHNAlgolia(String(payload?.query || "open source LLM")), connector: "hn_algolia_search" };
  if (hint === "openmeteo" || k === "sensor") return { call: () => callOpenMeteo(), connector: "openmeteo" };
  if (hint === "duckduckgo") return { call: () => callDuckDuckGo(String(payload?.query || "open source agentic AI")), connector: "duckduckgo_instant" };
  if (k === "research" || r.includes("research")) {
    return { call: () => callPollinationsLLM(String(payload?.prompt || "Summarize the open-source agentic AI landscape in two sentences.")), connector: "pollinations_text" };
  }

  // Default rotation: spread load across all real providers using current second
  const rotation = [
    () => ({ call: () => callPollinationsLLM("Provide one production-ready insight about open-source agentic AI."), connector: "pollinations_text" }),
    () => ({ call: () => callDuckDuckGo("open source agentic AI"), connector: "duckduckgo_instant" }),
    () => ({ call: () => callWikipedia("Open-source artificial intelligence"), connector: "wikipedia_rest" }),
    () => ({ call: () => callOpenAlex("agentic LLM"), connector: "openalex_works" }),
    () => ({ call: () => callCrossref("autonomous agent LLM"), connector: "crossref_works" }),
    () => ({ call: () => callArxiv("autonomous agent LLM"), connector: "arxiv_query" }),
    () => ({ call: () => callHNAlgolia("LLM agent"), connector: "hn_algolia_search" }),
    () => ({ call: () => callGithubRepos("agentic-ai"), connector: "github_search_repos" }),
    () => ({ call: () => callOpenMeteo(), connector: "openmeteo" }),
  ];
  return rotation[Math.floor(Date.now() / 1000) % rotation.length]();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

    const url = new URL(req.url);
    const batchSize = Math.max(1, Math.min(8, parseInt(url.searchParams.get("batch_size") || "4", 10) || 4));

    const { data: queued, error: qErr } = await sb
      .from("runtime_jobs")
      .select("task_id,task_kind,agent_role,payload,status,attempts,max_attempts")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (qErr) {
      return new Response(JSON.stringify({ ok: false, error: qErr.message }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobs = queued ?? [];
    if (jobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, note: "no queued jobs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const job of jobs) {
      const taskId = String(job.task_id);
      const taskKind = String(job.task_kind || "");
      const agentRole = String(job.agent_role || "");
      const payload = (job.payload as Record<string, unknown>) || {};

      // Mark running
      await sb.from("runtime_jobs").update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("task_id", taskId);

      const picked = pickProviderForJob(taskKind, agentRole, payload);
      const startMs = Date.now();
      let providerResult: ProviderResult;
      try {
        providerResult = await picked.call();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        providerResult = { connector: picked.connector, endpoint: "", status_code: 0, response_hash: "", excerpt: "", raw_size: 0, ok: false };
        await sb.from("runtime_audit_log").insert({
          task_id: taskId, agent_role: agentRole || "research_agent_external",
          action: "agentic_bridge:fetch_error",
          diff_or_effect: { connector: picked.connector, error: msg },
        });
      }

      const latencyMs = Date.now() - startMs;

      // Record real external call
      await sb.from("runtime_external_calls").insert({
        task_id: taskId,
        agent_role: agentRole || "research_agent_external",
        connector: providerResult.connector,
        endpoint: providerResult.endpoint,
        cost_cents: 0,
        is_paid: false,
        status_code: providerResult.status_code,
        response_hash: providerResult.response_hash,
        reversible: true,
      });

      // Touch connector last_used_at
      await sb.from("runtime_connector_registry")
        .update({ last_used_at: new Date().toISOString() })
        .eq("connector_key", providerResult.connector);

      // Real evidence bundle (no mock data)
      await sb.from("runtime_evidence_bundles").insert({
        task_id: taskId,
        bundle_type: "integration",
        collected_by: providerResult.connector,
        before_state: { provider_hint: payload?.provider_hint ?? null, payload_keys: Object.keys(payload) },
        after_state: {
          connector: providerResult.connector,
          status_code: providerResult.status_code,
          response_hash: providerResult.response_hash,
          excerpt: providerResult.excerpt,
          raw_size: providerResult.raw_size,
          latency_ms: latencyMs,
        },
        artifacts: [{ type: "external_response", uri: providerResult.endpoint, hash: providerResult.response_hash, mime_type: "application/json" }],
        validation: { passed: providerResult.ok, checks: ["status_code_2xx", "response_hash_present"], notes: providerResult.ok ? "ok" : "non-2xx or empty" },
      });

      const finalStatus = providerResult.ok ? "completed" : "failed";

      await sb.from("runtime_jobs").update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result: {
          connector: providerResult.connector,
          status_code: providerResult.status_code,
          response_hash: providerResult.response_hash,
          excerpt: providerResult.excerpt,
          latency_ms: latencyMs,
        },
      }).eq("task_id", taskId);

      await sb.from("runtime_audit_log").insert({
        task_id: taskId,
        agent_role: agentRole || "research_agent_external",
        action: providerResult.ok ? "agentic_bridge:completed" : "agentic_bridge:failed",
        diff_or_effect: {
          connector: providerResult.connector,
          status_code: providerResult.status_code,
          response_hash: providerResult.response_hash,
          excerpt: providerResult.excerpt.slice(0, 160),
          latency_ms: latencyMs,
        },
      });

      results.push({
        task_id: taskId,
        connector: providerResult.connector,
        status_code: providerResult.status_code,
        ok: providerResult.ok,
        latency_ms: latencyMs,
        excerpt: providerResult.excerpt.slice(0, 160),
      });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
