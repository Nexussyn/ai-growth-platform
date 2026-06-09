// Autonomous Coder Agent v2: picks high-value coding tasks, generates code via free LLMs, stores artifacts, triggers deploy
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE_URL = SUPABASE_URL + "/functions/v1";

const FREE_LLMS = [
  {
    name: "hf-deepseek",
    url: "https://api-inference.huggingface.co/models/deepseek-ai/deepseek-coder-6.7b-instruct",
    build: (p: string) => ({ inputs: `### Instruction:\n${p}\n### Response:\n`, parameters: { max_new_tokens: 900, return_full_text: false, temperature: 0.15 } }),
    parse: async (r: Response) => { const j = await r.json(); return Array.isArray(j) ? (j[0]?.generated_text ?? "") : (j?.generated_text ?? ""); }
  },
  {
    name: "hf-codellama",
    url: "https://api-inference.huggingface.co/models/codellama/CodeLlama-7b-Instruct-hf",
    build: (p: string) => ({ inputs: `[INST] ${p} [/INST]`, parameters: { max_new_tokens: 900, return_full_text: false, temperature: 0.15 } }),
    parse: async (r: Response) => { const j = await r.json(); return Array.isArray(j) ? (j[0]?.generated_text ?? "") : (j?.generated_text ?? ""); }
  },
  {
    name: "hf-mistral",
    url: "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
    build: (p: string) => ({ inputs: `<s>[INST] ${p} [/INST]`, parameters: { max_new_tokens: 700, return_full_text: false, temperature: 0.2 } }),
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
        signal: AbortSignal.timeout(28000)
      });
      if (r.ok) {
        const text = (await llm.parse(r)).trim();
        if (text.length > 30) return { provider: llm.name, text, ok: true };
      }
    } catch (_) { /* try next */ }
  }
  return { provider: "none", text: "", ok: false };
}

// HIGH-VALUE coding tasks — fix real bugs, build real features
const CODING_TASKS = [
  {
    id: "usdc-withdraw-executor",
    file: "supabase/functions/runtime-payments/withdraw.ts",
    prompt: "Write a TypeScript Deno Edge Function that executes USDC withdrawals on Base chain using ethers.js. It should: read pending withdrawals from a 'withdrawal_queue' table, sign and broadcast the ERC20 transfer, update withdrawal status to 'completed' with tx_hash. Include retry logic with exponential backoff. Use environment variables for private key. Add structured error logging."
  },
  {
    id: "anti-fake-token-guard",
    file: "supabase/functions/runtime-onchain-watcher/token-guard.ts",
    prompt: "Write a TypeScript module that validates on-chain payment receipts. It must: verify the token contract address matches exactly the official Circle USDC contracts (Base: 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913, Arbitrum: 0xaf88d065e77c8cc2239327c5edb3a432268e5831, Optimism: 0x0b2c639c533813f4aa9d7837caf62653d097ff85, Polygon: 0x3c499c542cef5e3811e1192ce70d8cc03d5c3359), reject any other token, log fake token attempts to a 'security_alerts' table with from_address and contract."
  },
  {
    id: "agent-leaderboard",
    file: "supabase/functions/runtime-public-federation/leaderboard.ts",
    prompt: "Write a TypeScript Deno Edge Function that returns a JSON leaderboard of top AI agents. Query a 'agent_results' table grouped by agent_id, summing tasks_completed and usdc_earned. Return top 20 agents with rank, agent_id, tasks_completed, usdc_earned, success_rate. Include CORS headers. Cache result for 60 seconds using a simple in-memory cache."
  },
  {
    id: "task-auto-pricer",
    file: "supabase/functions/runtime-broker/auto-pricer.ts",
    prompt: "Write a TypeScript module that auto-prices bounty tasks based on complexity. Rules: 'code' tasks with >500 char description = $5 USDC, short code tasks = $2 USDC, 'audit' tasks = $8 USDC, 'research' tasks = $3 USDC, 'deploy' tasks = $6 USDC. Implement as a pure function that takes task_kind and description_length and returns price_usdc. Include TypeScript types and unit test examples."
  },
  {
    id: "revenue-dashboard-api",
    file: "supabase/functions/runtime-finance/dashboard.ts",
    prompt: "Write a TypeScript Deno Edge Function that returns a JSON revenue dashboard. It should query: total USDC received (from onchain_payments), total commissions paid (from commission_ledger), platform net revenue, breakdown by chain (Base, Arbitrum, Optimism, Polygon), revenue trend over last 7 days (one row per day). Include CORS headers. Return as structured JSON with summary and time_series fields."
  },
  {
    id: "self-healing-monitor",
    file: "supabase/functions/runtime-self-healer/monitor.ts",
    prompt: "Write a TypeScript Deno Edge Function that monitors system health and auto-heals. It should: check orchestrator_heartbeats for agents silent >5 minutes, check autonomous_task_queue for tasks stuck in 'processing' >10 minutes (reset to 'queued'), check system_events for error rate >10% in last hour and insert a 'health_alert' event. Return a health report JSON with checks_run, issues_found, auto_fixed counts."
  },
  {
    id: "federation-broadcaster",
    file: "supabase/functions/runtime-viral-seed/broadcaster.ts",
    prompt: "Write a TypeScript Deno Edge Function that broadcasts federation membership invites. It should: fetch registered agents from agent_registry table, for each agent that joined >7 days ago and has earned >$1 USDC, generate a personalized referral link (base URL + agent_id), insert a 'referral_broadcast_sent' event into system_events. Return count of broadcasts sent."
  }
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/runtime-autonomous-coder/, "") || "/";
  const now = new Date().toISOString();

  try {
    if (path === "/" || path === "/status") {
      return json({ agent: "autonomous-coder", version: "2.0", capabilities: ["code_generation", "diff_proposal", "auto_deploy", "self_improvement"],
        free_llm: true, tasks_catalog: CODING_TASKS.length, status: "ready",
        catalog_preview: CODING_TASKS.map(t => ({ id: t.id, file: t.file })) });
    }

    if (path === "/run" && (req.method === "POST" || req.method === "GET")) {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      // Rotate through tasks sequentially based on minute of hour to ensure all get coverage
      const minute = new Date().getMinutes();
      const taskIndex = body.task_index ?? (minute % CODING_TASKS.length);
      const task = CODING_TASKS[taskIndex % CODING_TASKS.length];
      const taskId = `autonomous-v2-${task.id}-${Date.now()}`;

      const llm = await callLLM(task.prompt);

      if (!llm.ok) {
        await sb.from("system_events").insert({ event_type: "autonomous_coder_failed", source: "runtime-autonomous-coder",
          payload: { task_id: taskId, task_name: task.id, reason: "llm_unavailable" }, created_at: now });
        return json({ status: "failed", task: task.id, reason: "llm_unavailable" }, 200);
      }

      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(llm.text))
        .then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join(""));

      await sb.from("runtime_artifacts").insert({
        task_id: taskId, kind: "code_diff",
        content: JSON.stringify({ file_path: task.file, generated: llm.text, provider: llm.provider, version: "2.0" }),
        hash, deployed: false
      });

      await sb.from("runtime_jobs").insert({
        task_kind: "code_generation", agent_role: "autonomous_coder", task_id: taskId,
        status: "completed", priority: 3,
        payload: { task: task.id, file: task.file, version: "2.0" },
        result: { provider: llm.provider, code_preview: llm.text.substring(0, 200), file_path: task.file },
        created_at: now, completed_at: now
      });

      await sb.from("system_events").insert({
        event_type: "autonomous_code_generated", source: "runtime-autonomous-coder",
        payload: { task_id: taskId, task_name: task.id, file_path: task.file, provider: llm.provider,
          code_length: llm.text.length, hash: hash.substring(0, 16), version: "2.0" },
        created_at: now
      });

      await sb.from("orchestrator_heartbeats").insert({
        agent_id: "runtime-autonomous-coder-v2", status: "active", jobs_processed: 1,
        metadata: { task: task.id, provider: llm.provider, file: task.file, version: "2.0" },
        created_at: now
      });

      return json({
        status: "completed", version: "2.0", task_id: taskId, task_name: task.id,
        file_path: task.file, provider: llm.provider,
        code_preview: llm.text.substring(0, 500) + (llm.text.length > 500 ? "..." : ""),
        hash: hash.substring(0, 16),
        next_step: `To deploy: POST ${BASE_URL}/runtime-deploy/apply {"task_id": "${taskId}", "deploy_kind": "artifact"}`
      });
    }

    if (path === "/tasks") {
      return json({ version: "2.0", tasks: CODING_TASKS.map(t => ({ id: t.id, file: t.file, prompt_preview: t.prompt.substring(0, 120) + "..." })) });
    }

    return json({ agent: "autonomous-coder", version: "2.0", endpoints: ["/status", "/run", "/tasks"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
