// Autonomous Coder Agent: picks coding tasks, generates code via free LLM, proposes diffs, triggers deploy
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE_URL = SUPABASE_URL + "/functions/v1";

// Free LLMs — no key required
const FREE_LLMS = [
  {
    name: "hf-codellama",
    url: "https://api-inference.huggingface.co/models/codellama/CodeLlama-7b-Instruct-hf",
    build: (p: string) => ({ inputs: `[INST] ${p} [/INST]`, parameters: { max_new_tokens: 800, return_full_text: false, temperature: 0.15 } }),
    parse: async (r: Response) => { const j = await r.json(); return Array.isArray(j) ? (j[0]?.generated_text ?? "") : (j?.generated_text ?? ""); }
  },
  {
    name: "hf-deepseek",
    url: "https://api-inference.huggingface.co/models/deepseek-ai/deepseek-coder-6.7b-instruct",
    build: (p: string) => ({ inputs: `### Instruction:\n${p}\n### Response:\n`, parameters: { max_new_tokens: 800, return_full_text: false, temperature: 0.15 } }),
    parse: async (r: Response) => { const j = await r.json(); return Array.isArray(j) ? (j[0]?.generated_text ?? "") : (j?.generated_text ?? ""); }
  },
  {
    name: "hf-mistral",
    url: "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
    build: (p: string) => ({ inputs: `<s>[INST] ${p} [/INST]`, parameters: { max_new_tokens: 600, return_full_text: false, temperature: 0.2 } }),
    parse: async (r: Response) => { const j = await r.json(); return Array.isArray(j) ? (j[0]?.generated_text ?? "") : (j?.generated_text ?? ""); }
  }
];

async function callLLM(prompt: string): Promise<{ provider: string; text: string; ok: boolean }> {
  for (const llm of FREE_LLMS) {
    try {
      const r = await fetch(llm.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(llm.build(prompt)),
        signal: AbortSignal.timeout(25000)
      });
      if (r.ok) {
        const text = (await llm.parse(r)).trim();
        if (text.length > 30) return { provider: llm.name, text, ok: true };
      }
    } catch (_) { /* try next */ }
  }
  return { provider: "none", text: "", ok: false };
}

// Coding tasks catalog — what the autonomous agent works on
const CODING_TASKS = [
  { id: "improve-error-handling", file: "supabase/functions/runtime-agentic-bridge/index.ts",
    prompt: "Write a TypeScript Deno Edge Function that improves error handling and retry logic for an AI agent task runner. Include exponential backoff, circuit breaker pattern, and structured error logging to a system_events table." },
  { id: "add-i18n-endpoint", file: "supabase/functions/runtime-public-federation/i18n.ts",
    prompt: "Write a TypeScript/Deno function that returns localized federation welcome messages for these languages: en, fr, zh, es, de, ja, ko, pt, ar, ru. Return a JSON object with language codes as keys." },
  { id: "revenue-calculator", file: "src/utils/revenueCalculator.ts",
    prompt: "Write a TypeScript utility that calculates revenue sharing for an AI agent platform: executing agent gets 85%, platform keeps 15%, 25% of platform revenue goes to contributor pool, 25% referral bonus. Include TypeScript types and JSDoc." },
  { id: "agent-health-monitor", file: "supabase/functions/runtime-observability/health.ts",
    prompt: "Write a TypeScript/Deno module that monitors AI agent health: checks last heartbeat, counts failed jobs in last 5 minutes, computes success rate, and returns a structured health report JSON." },
  { id: "llm-router", file: "src/lib/llmRouter.ts",
    prompt: "Write a TypeScript LLM router that tries free models first (HuggingFace Mistral, Zephyr, CodeLlama), falls back to paid if budget allows, and tracks usage/cost per provider. No API key required for free tier." },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/runtime-autonomous-coder/, "") || "/";
  const now = new Date().toISOString();

  try {
    if (path === "/" || path === "/status") {
      return json({ agent: "autonomous-coder", version: "1.0", capabilities: ["code_generation", "diff_proposal", "auto_deploy"],
        free_llm: true, tasks_catalog: CODING_TASKS.length, status: "ready" });
    }

    if (path === "/run" && (req.method === "POST" || req.method === "GET")) {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const taskIndex = body.task_index ?? Math.floor(Math.random() * CODING_TASKS.length);
      const task = CODING_TASKS[taskIndex % CODING_TASKS.length];
      const taskId = `autonomous-${task.id}-${Date.now()}`;

      // Generate code
      const llm = await callLLM(task.prompt);

      if (!llm.ok) {
        await sb.from("system_events").insert({ event_type: "autonomous_coder_failed", source: "runtime-autonomous-coder",
          payload: { task_id: taskId, task_name: task.id, reason: "llm_unavailable" }, created_at: now });
        return json({ status: "failed", task: task.id, reason: "llm_unavailable" }, 500);
      }

      // Store as artifact
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(llm.text))
        .then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join(""));

      await sb.from("runtime_artifacts").insert({
        task_id: taskId, kind: "code_diff",
        content: JSON.stringify({ file_path: task.file, generated: llm.text, provider: llm.provider }),
        hash, deployed: false
      });

      // Also insert into runtime_jobs as completed record
      await sb.from("runtime_jobs").insert({
        task_kind: "code_generation", agent_role: "autonomous_coder", task_id: taskId,
        status: "completed", priority: 2,
        payload: { task: task.prompt, file: task.file },
        result: { provider: llm.provider, code_preview: llm.text.substring(0, 200), file_path: task.file },
        created_at: now, completed_at: now
      });

      // Log event
      await sb.from("system_events").insert({
        event_type: "autonomous_code_generated", source: "runtime-autonomous-coder",
        payload: { task_id: taskId, task_name: task.id, file_path: task.file, provider: llm.provider,
          code_length: llm.text.length, hash: hash.substring(0, 16) },
        created_at: now
      });

      // Log heartbeat
      await sb.from("orchestrator_heartbeats").insert({
        agent_id: "runtime-autonomous-coder", status: "active", jobs_processed: 1,
        metadata: { task: task.id, provider: llm.provider, file: task.file },
        created_at: now
      });

      return json({
        status: "completed", task_id: taskId, task_name: task.id,
        file_path: task.file, provider: llm.provider,
        code_preview: llm.text.substring(0, 500) + (llm.text.length > 500 ? "..." : ""),
        hash: hash.substring(0, 16),
        next_step: `To deploy: POST ${BASE_URL}/runtime-deploy/apply {"task_id": "${taskId}", "deploy_kind": "artifact"}`
      });
    }

    if (path === "/tasks") {
      return json({ tasks: CODING_TASKS.map(t => ({ id: t.id, file: t.file, prompt_preview: t.prompt.substring(0, 100) + "..." })) });
    }

    return json({ agent: "autonomous-coder", endpoints: ["/status", "/run", "/tasks"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
