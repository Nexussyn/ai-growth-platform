import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asBoolean(v: unknown): boolean {
  return v === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [routes, approvals, connectors, health, jobs, audit, evidence, violations, projection] = await Promise.all([
      sb.from("runtime_route_state").select("*").order("updated_at", { ascending: false }).limit(50),
      sb.from("runtime_approval_state").select("*").order("updated_at", { ascending: false }).limit(50),
      sb.from("runtime_connector_registry").select("*").order("registered_at", { ascending: false }).limit(50),
      sb.from("runtime_health_state").select("*").limit(50),
      sb.from("runtime_jobs").select("task_id,status,task_kind,priority,created_at,updated_at").order("updated_at", { ascending: false }).limit(20),
      sb.from("runtime_audit_log").select("task_id,agent_role,action,created_at").order("created_at", { ascending: false }).limit(20),
      sb.from("runtime_evidence_bundles").select("evidence_bundle_id,task_id,bundle_type,created_at").order("created_at", { ascending: false }).limit(20),
      sb.from("runtime_coherence_violations").select("*").eq("status", "open").order("detected_at", { ascending: false }).limit(20),
      sb.from("projection_metrics").select("*"),
    ]);

    const errors = [routes, approvals, connectors, health, jobs, audit, evidence, violations, projection]
      .map((r) => r.error?.message)
      .filter(Boolean) as string[];

    const projMap: Record<string, number> = {};
    for (const row of asArray<{ metric_key: string; metric_value: number }>(projection.data)) {
      projMap[row.metric_key] = asNumber(row.metric_value);
    }

    const eventsList = asArray<Record<string, unknown>>(audit.data).map((r) => ({
      task_id: r.task_id,
      agent_role: r.agent_role,
      action: r.action,
      timestamp: r.created_at,
    }));
    const evidenceList = asArray<Record<string, unknown>>(evidence.data).map((r) => ({
      evidence_bundle_id: r.evidence_bundle_id,
      task_id: r.task_id,
      bundle_type: r.bundle_type,
      timestamp: r.created_at,
    }));

    const openViolations = asArray(violations.data);
    const liveConnection = errors.length === 0;
    const coherenceOk = openViolations.length === 0 && liveConnection;

    const snapshot = {
      counts: {
        impressions: asNumber(projMap.impressions),
        clicks: asNumber(projMap.clicks),
        iterations: asNumber(projMap.iterations),
        subscriptions: asNumber(projMap.subscriptions),
        usage_credits: asNumber(projMap.usage_credits),
        referral_rewards: asNumber(projMap.referral_rewards),
        canonical_routes_tracked: asNumber(projMap.canonical_routes_tracked),
        canonical_approvals_recorded: asNumber(projMap.canonical_approvals_recorded),
        connectors_registered: asNumber(projMap.connectors_registered),
        coherence_violations_detected: asNumber(projMap.coherence_violations_detected),
        coherence_violations_resolved: asNumber(projMap.coherence_violations_resolved),
        open_violations: openViolations.length,
      },
      flags: {
        live_connection: liveConnection,
        wallet_configured: asBoolean(projMap.wallet_configured > 0),
        preview_ready: liveConnection,
        scheduler_active: asBoolean(projMap.scheduler_active > 0),
        coherence_ok: coherenceOk,
      },
      lists: {
        routes: asArray(routes.data),
        approvals: asArray(approvals.data),
        connectors: asArray(connectors.data),
        health: asArray(health.data),
        events: eventsList,
        evidence: evidenceList,
        jobs: asArray(jobs.data),
        violations: openViolations,
      },
      strings: {
        status: liveConnection ? (coherenceOk ? "coherent" : "degraded") : "disconnected",
        message: liveConnection
          ? coherenceOk
            ? "Canonical sources synchronized."
            : `${openViolations.length} open coherence violation(s).`
          : "Live connection interrupted.",
        error: errors.join("; "),
      },
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(snapshot), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({
        counts: { impressions: 0, clicks: 0, iterations: 0, subscriptions: 0, usage_credits: 0, referral_rewards: 0, canonical_routes_tracked: 0, canonical_approvals_recorded: 0, connectors_registered: 0, coherence_violations_detected: 0, coherence_violations_resolved: 0, open_violations: 0 },
        flags: { live_connection: false, wallet_configured: false, preview_ready: false, scheduler_active: false, coherence_ok: false },
        lists: { routes: [], approvals: [], connectors: [], health: [], events: [], evidence: [], jobs: [], violations: [] },
        strings: { status: "error", message: "Canonical fetch failed.", error: msg },
        generated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
