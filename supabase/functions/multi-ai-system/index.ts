import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * GOVERNED MULTI-AI SYSTEM
 *
 * Replaces 62-job legacy orchestrator with thin routing layer.
 * All real work delegated to open-world-runtime's 8 governed agents.
 * This eliminates DB saturation from redundant parallel job execution.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const WALLET_ADDRESS = Deno.env.get("WALLET_ADDRESS") ?? "";
const WALLET_CONFIGURED = WALLET_ADDRESS.length > 10;
const WALLET_MASKED = WALLET_CONFIGURED ? `***${WALLET_ADDRESS.slice(-4)}` : "";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RUNTIME_URL = `${SUPABASE_URL}/functions/v1/open-world-runtime`;
const runtimeHeaders = { "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

const GOVERNED_AGENTS = [
  { name: "supervisor", role: "Plans, routes, approves, escalates" },
  { name: "discovery", role: "Finds opportunities, agents, channels" },
  { name: "outreach", role: "Real outbound communication" },
  { name: "execution", role: "Real external actions, contracts" },
  { name: "connector_health", role: "Monitors integrations, circuit breakers" },
  { name: "reconciliation", role: "Verifies persistence, delivery, consistency" },
  { name: "visibility", role: "Channel performance, suppression" },
  { name: "payout", role: "Wallet/settlement tracing" },
];

const PRICE_USDC = 0.03;
const SPLIT_PCT_PAYOUT = 75;
const SPLIT_PCT_RESERVE = 25;

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME DELEGATION — all work goes to governed agents
// ═══════════════════════════════════════════════════════════════════════════════

async function callRuntime(path: string, method = "POST"): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${RUNTIME_URL}${path}`, { method, headers: runtimeHeaders });
    if (res.ok) return await res.json();
    return { error: `HTTP ${res.status}`, path };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "unknown", path };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULER — governed tick (max 1 cycle per tick, no DB saturation)
// ═══════════════════════════════════════════════════════════════════════════════

async function governedTick(): Promise<Record<string, unknown>> {
  const result = await callRuntime("/cycle");
  return { version: "governed-2.0", agents: 8, tick: "complete", ...result };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PROJECTION — fast reads from runtime
// ═══════════════════════════════════════════════════════════════════════════════

async function getDashboard(): Promise<Record<string, unknown>> {
  const metrics = await callRuntime("/dashboard", "GET");
  return {
    version: "governed-2.0",
    architecture: "minimal_event_driven",
    active_agents: 8,
    max_agents: 8,
    purged_legacy_jobs: 62,
    wallet_configured: WALLET_CONFIGURED,
    wallet_masked: WALLET_MASKED,
    pricing: { price_usdc: PRICE_USDC, split_payout: SPLIT_PCT_PAYOUT, split_reserve: SPLIT_PCT_RESERVE },
    ...metrics,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/multi-ai-system/, "");

    // Dashboard (GET)
    if (path === "/dashboard" || path === "/status" || path === "/") {
      return json(await getDashboard());
    }

    // Governed tick (POST) — replaces legacy executeAllDueJobs
    if (path === "/scheduler/tick" && req.method === "POST") {
      return json(await governedTick());
    }

    // Run specific governed worker
    if (path === "/scheduler/run/discovery" || path === "/discover") return json(await callRuntime("/discover"));
    if (path === "/scheduler/run/outreach" || path === "/outreach") return json(await callRuntime("/outreach"));
    if (path === "/scheduler/run/execution" || path === "/execute") return json(await callRuntime("/execute"));
    if (path === "/scheduler/run/connector_health" || path === "/health") return json(await callRuntime("/health"));
    if (path === "/scheduler/run/reconciliation" || path === "/reconcile") return json(await callRuntime("/reconcile"));
    if (path === "/scheduler/run/visibility" || path === "/visibility") return json(await callRuntime("/visibility"));
    if (path === "/scheduler/run/payout" || path === "/payout") return json(await callRuntime("/payout"));
    if (path === "/scheduler/run/cycle" || path === "/cycle") return json(await callRuntime("/cycle"));

    // Any other scheduler/run/* maps to full cycle (legacy compat)
    if (path.startsWith("/scheduler/run/")) return json(await governedTick());

    // Scheduler status
    if (path === "/scheduler/status") {
      return json({ version: "governed-2.0", agents: GOVERNED_AGENTS, max_agents: 8, legacy_purged: true, jobs_purged: 62 });
    }

    // Agents list
    if (path === "/agents" || path === "/scheduler/agents") {
      return json({ governed_agents: GOVERNED_AGENTS, count: 8, max: 8, purged_legacy: ["marketing", "growth", "variant_testing", "devops", "support", "security", "recruiter"] });
    }

    // Events
    if (path === "/events") return json(await callRuntime("/events", "GET"));

    // Capabilities
    if (path === "/capabilities") return json(await callRuntime("/capabilities", "GET"));

    // Connectors
    if (path === "/connectors") return json(await callRuntime("/connectors", "GET"));

    // Wallet status
    if (path === "/wallet") {
      return json({ configured: WALLET_CONFIGURED, masked: WALLET_MASKED, pricing: { price_usdc: PRICE_USDC, split_payout: SPLIT_PCT_PAYOUT, split_reserve: SPLIT_PCT_RESERVE } });
    }

    // Health (lightweight)
    if (path === "/health" && req.method === "GET") {
      return json({ status: "governed", version: "2.0", agents: 8, architecture: "event_driven" });
    }

    // Purge report
    if (path === "/purge-report") {
      return json({
        purged_agents: ["marketing", "growth", "variant_testing", "devops", "support", "security", "recruiter"],
        purged_jobs: 62,
        reason: "Duplicate responsibilities, no unique persisted external actions, DB saturation",
        kept_agents: GOVERNED_AGENTS,
        schema: {
          new_tables: ["domain_events", "outbox", "job_queue", "job_attempts", "processed_events", "connector_state", "delivery_log", "settlement_log", "projection_metrics", "governed_agents"],
          legacy_tables_deprecated: 80,
          architecture: "event_driven_outbox_pattern",
        },
      });
    }

    return json({ error: "not_found", routes: ["/dashboard", "/scheduler/tick", "/scheduler/status", "/agents", "/events", "/capabilities", "/connectors", "/wallet", "/purge-report"] }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
