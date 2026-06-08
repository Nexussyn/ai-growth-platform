import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/runtime-brokerage", "").replace(/^\//, "");

    if (req.method === "GET" && (path === "" || path === "dashboard")) {
      return await handleDashboard();
    }

    if (req.method === "POST" && path === "dispatch") {
      return await handleDispatch(req);
    }

    if (req.method === "POST" && path === "complete") {
      return await handleComplete(req);
    }

    if (req.method === "POST" && path === "tick") {
      return await handleTick();
    }

    if (req.method === "POST" && path === "financial/open") {
      return await handleOpenPosition(req);
    }

    if (req.method === "POST" && path === "financial/close") {
      return await handleClosePosition(req);
    }

    return json({ error: "not_found", routes: ["dashboard", "dispatch", "complete", "tick", "financial/open", "financial/close"] }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function handleDashboard() {
  const { data, error } = await supabase.rpc("brokerage_dashboard");
  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function handleDispatch(req: Request) {
  const body = await req.json();
  const { task_kind, task_summary, gross_value_usd, client_id, payload } = body;

  if (!task_kind || !task_summary) {
    return json({ error: "task_kind and task_summary required" }, 400);
  }

  const { data, error } = await supabase.rpc("broker_assign_task", {
    p_task_kind: task_kind,
    p_task_summary: task_summary,
    p_gross_value_usd: gross_value_usd ?? estimateTaskValue(task_kind),
    p_client_id: client_id ?? "platform",
    p_payload: payload ?? {},
  });

  if (error) return json({ error: error.message }, 500);
  if (data?.error) return json(data, 422);

  // Dispatch to the actual coding agent asynchronously
  const agentSlug = data.agent_slug;
  EdgeRuntime.waitUntil(executeAgentTask(data.task_id, agentSlug, task_kind, task_summary, payload ?? {}));

  return json({ ...data, dispatched: true });
}

async function handleComplete(req: Request) {
  const { task_id, result, quality_score } = await req.json();
  if (!task_id) return json({ error: "task_id required" }, 400);

  const { data, error } = await supabase.rpc("broker_complete_task", {
    p_task_id: task_id,
    p_result: result ?? {},
    p_quality_score: quality_score ?? 85,
  });

  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function handleTick() {
  // Auto-dispatch pending coding tasks from runtime_jobs to brokerage
  const { data: pendingJobs } = await supabase
    .from("runtime_jobs")
    .select("task_id, task_kind, target, payload, status")
    .in("status", ["pending", "queued"])
    .in("task_kind", ["code", "research", "financial", "audit", "deploy"])
    .order("created_at", { ascending: true })
    .limit(5);

  const dispatched: string[] = [];

  for (const job of (pendingJobs ?? [])) {
    const value = estimateTaskValue(job.task_kind);
    const { data } = await supabase.rpc("broker_assign_task", {
      p_task_kind: job.task_kind ?? "code",
      p_task_summary: job.target ?? `Job ${job.task_id}`,
      p_gross_value_usd: value,
      p_client_id: "runtime_jobs:" + job.task_id,
      p_payload: job.payload ?? {},
    });

    if (data && !data.error) {
      dispatched.push(data.task_id);
      await supabase
        .from("runtime_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("task_id", job.task_id)
        .eq("status", job.status);
    }
  }

  // Mark completed tasks where agent already returned results
  const { data: runningTasks } = await supabase
    .from("brokerage_tasks")
    .select("id, agent_slug, assigned_at")
    .eq("status", "assigned")
    .lt("assigned_at", new Date(Date.now() - 60000).toISOString())
    .limit(10);

  let autoCompleted = 0;
  for (const t of (runningTasks ?? [])) {
    // Check if the coding agent already ran (via invocations table)
    const { data: inv } = await supabase
      .from("coding_agent_invocations")
      .select("status")
      .eq("agent_slug", t.agent_slug)
      .gte("invoked_at", t.assigned_at)
      .eq("status", "success")
      .limit(1)
      .maybeSingle();

    if (inv) {
      await supabase.rpc("broker_complete_task", {
        p_task_id: t.id,
        p_result: { auto_completed: true },
        p_quality_score: 80,
      });
      autoCompleted++;
    }
  }

  // Update unrealized P&L for open financial positions using latest yield data
  const { data: openPos } = await supabase
    .from("financial_engineering_positions")
    .select("id, protocol_slug, amount_deployed_usd, expected_yield_pct, opened_at")
    .eq("status", "open")
    .limit(20);

  let positionsUpdated = 0;
  for (const pos of (openPos ?? [])) {
    const hoursOpen = (Date.now() - new Date(pos.opened_at).getTime()) / 3600000;
    const annualizedFraction = hoursOpen / 8760;
    const unrealized = Number(pos.amount_deployed_usd) * (Number(pos.expected_yield_pct) / 100) * annualizedFraction;

    await supabase
      .from("financial_engineering_positions")
      .update({ unrealized_pnl_usd: Math.round(unrealized * 10000) / 10000, updated_at: new Date().toISOString() })
      .eq("id", pos.id);
    positionsUpdated++;
  }

  return json({
    dispatched: dispatched.length,
    auto_completed: autoCompleted,
    positions_updated: positionsUpdated,
    tick_at: new Date().toISOString(),
  });
}

async function handleOpenPosition(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase.rpc("broker_open_position", {
    p_strategy_type: body.strategy_type ?? "yield_farming",
    p_strategy_name: body.strategy_name ?? "Manual position",
    p_protocol_slug: body.protocol_slug ?? null,
    p_chain: body.chain ?? "Base",
    p_asset_in: body.asset_in ?? "USDC",
    p_amount_usd: body.amount_usd ?? 0,
    p_expected_yield_pct: body.expected_yield_pct ?? 0,
    p_evidence: body.evidence ?? {},
  });
  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function handleClosePosition(req: Request) {
  const { position_id, realized_pnl_usd } = await req.json();
  if (!position_id) return json({ error: "position_id required" }, 400);

  const { data, error } = await supabase.rpc("broker_close_position", {
    p_position_id: position_id,
    p_realized_pnl_usd: realized_pnl_usd ?? 0,
  });
  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function executeAgentTask(taskId: string, agentSlug: string, taskKind: string, summary: string, payload: Record<string, unknown>) {
  // Lookup agent inference endpoint
  const { data: agent } = await supabase
    .from("coding_agents")
    .select("inference_url, slug")
    .eq("slug", agentSlug)
    .maybeSingle();

  if (!agent?.inference_url) {
    // Mark task as completed with no external call (free model, no endpoint available yet)
    await supabase.rpc("broker_complete_task", {
      p_task_id: taskId,
      p_result: { executed: false, reason: "no_inference_endpoint" },
      p_quality_score: 70,
    });
    return;
  }

  try {
    const resp = await fetch(agent.inference_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_kind: taskKind, summary, payload }),
      signal: AbortSignal.timeout(30000),
    });

    const result = resp.ok ? await resp.json() : { error: `HTTP ${resp.status}` };
    const quality = resp.ok ? 85 : 40;

    await supabase.rpc("broker_complete_task", {
      p_task_id: taskId,
      p_result: result,
      p_quality_score: quality,
    });

    // Record invocation
    await supabase.from("coding_agent_invocations").insert({
      agent_slug: agentSlug,
      task_kind: taskKind,
      task_summary: summary,
      status: resp.ok ? "success" : "failed",
      error_message: resp.ok ? null : `HTTP ${resp.status}`,
      invoked_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    await supabase.rpc("broker_complete_task", {
      p_task_id: taskId,
      p_result: { error: (e as Error).message },
      p_quality_score: 30,
    });
  }
}

function estimateTaskValue(taskKind: string): number {
  switch (taskKind) {
    case "code": return 25;
    case "financial": return 50;
    case "deploy": return 30;
    case "audit": return 40;
    case "research": return 15;
    default: return 20;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
