import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function sourceIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-public-federation/, "") || "/";
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

    if (req.method === "GET" && path === "/evolution") {
      const [
        { count: jobs_total },
        { count: jobs_completed },
        { count: jobs_failed },
        { count: jobs_running },
        { count: jobs_queued },
        { count: pulses_total },
        { count: connectors },
        { count: candidates },
        { count: candidates_ok },
        { count: nodes },
        { count: violations },
        { data: recent_pulses },
        { data: recent_completions },
        { data: top_sources },
        { data: wallet },
      ] = await Promise.all([
        sb.from("runtime_jobs").select("*", { count: "exact", head: true }),
        sb.from("runtime_jobs").select("*", { count: "exact", head: true }).eq("status", "completed"),
        sb.from("runtime_jobs").select("*", { count: "exact", head: true }).eq("status", "failed"),
        sb.from("runtime_jobs").select("*", { count: "exact", head: true }).eq("status", "running"),
        sb.from("runtime_jobs").select("*", { count: "exact", head: true }).eq("status", "queued"),
        sb.from("runtime_evolution_pulse").select("*", { count: "exact", head: true }),
        sb.from("runtime_connector_registry").select("*", { count: "exact", head: true }).eq("free_first", true),
        sb.from("runtime_provider_candidates").select("*", { count: "exact", head: true }),
        sb.from("runtime_provider_candidates").select("*", { count: "exact", head: true }).eq("status", "probed_ok"),
        sb.from("runtime_external_nodes").select("*", { count: "exact", head: true }),
        sb.from("profit_lock_violations").select("*", { count: "exact", head: true }),
        sb.from("runtime_evolution_pulse").select("pulse_kind,source,subject,details,created_at").order("created_at", { ascending: false }).limit(20),
        sb.from("runtime_jobs").select("task_kind,agent_role,task_id,updated_at").eq("status", "completed").order("updated_at", { ascending: false }).limit(15),
        sb.from("runtime_provider_candidates").select("source").limit(2000),
        sb.from("owner_wallet_lock").select("masked_address,network,currency,locked_at").maybeSingle(),
      ]);

      const sourceCounts: Record<string, number> = {};
      (top_sources ?? []).forEach((r) => { const k = String((r as { source?: string }).source || "unknown"); sourceCounts[k] = (sourceCounts[k] || 0) + 1; });

      return corsJson({
        evolution: {
          generated_at: new Date().toISOString(),
          owner_wallet: wallet ? { masked: wallet.masked_address, network: wallet.network, currency: wallet.currency, locked_at: wallet.locked_at, sealed: true } : { sealed: false },
          throughput: {
            jobs_total: jobs_total ?? 0,
            jobs_completed: jobs_completed ?? 0,
            jobs_failed: jobs_failed ?? 0,
            jobs_running: jobs_running ?? 0,
            jobs_queued: jobs_queued ?? 0,
            success_rate: jobs_total ? Number(((jobs_completed ?? 0) / jobs_total).toFixed(4)) : 0,
          },
          federation: {
            free_connectors: connectors ?? 0,
            external_nodes: nodes ?? 0,
            candidates_total: candidates ?? 0,
            candidates_probed_ok: candidates_ok ?? 0,
            evolution_pulses: pulses_total ?? 0,
            profit_redirections_blocked: violations ?? 0,
            top_sources: sourceCounts,
          },
          recent_completions: recent_completions ?? [],
          recent_pulses: recent_pulses ?? [],
          policy: {
            free_first: true,
            no_key_required: true,
            paid_blocked_until_first_revenue: true,
            owner_wallet_immutable: true,
          },
        },
      });
    }

    if (req.method === "GET" && (path === "/" || path === "/manifest")) {
      const [{ count: nodes }, { count: connectors }, { count: pulses }, { data: recent }, { data: products }, { data: chainsData }, { data: lock }, { data: pool }, { data: templates }, { count: activePartners }, { count: activeContracts }] = await Promise.all([
        sb.from("runtime_external_nodes").select("*", { count: "exact", head: true }),
        sb.from("runtime_connector_registry").select("*", { count: "exact", head: true }).eq("free_first", true),
        sb.from("runtime_evolution_pulse").select("*", { count: "exact", head: true }),
        sb.from("runtime_evolution_pulse").select("pulse_kind,source,subject,created_at").order("created_at", { ascending: false }).limit(10),
        sb.from("payment_products").select("slug,title,description,price_usdc,deliverable_kind,accepted_chains,display_order").eq("active", true).order("display_order", { ascending: true }),
        sb.from("payment_chains").select("id,network,chain_id,token_symbol,token_contract,token_decimals,watch_address,explorer_url").eq("active", true).order("chain_id", { ascending: true }),
        sb.from("owner_wallet_lock").select("masked_address,network,currency,locked_at").maybeSingle(),
        sb.from("partnership_pool_state").select("*").eq("id", "default").maybeSingle(),
        sb.from("partnership_contract_templates").select("code,title,summary,agent_kind,share_bps,responsibilities,evidence_required,payable_in").eq("active", true).order("display_order", { ascending: true }),
        sb.from("agentic_partners").select("*", { count: "exact", head: true }).eq("status", "active"),
        sb.from("partnership_contracts").select("*", { count: "exact", head: true }).eq("status", "active"),
      ]);

      await sb.rpc("record_pulse", {
        p_kind: "manifest_served", p_source: "public_manifest", p_subject: sourceIp(req) || "anonymous",
        p_details: { user_agent: req.headers.get("user-agent") || "" },
      });

      const baseChain = (chainsData ?? []).find((c) => (c as { id?: string }).id === "base") as { watch_address?: string } | undefined;
      const ownerAddress = String(baseChain?.watch_address || "").toLowerCase();

      return corsJson({
        federation: {
          name: "runtime-open-federation",
          version: "1.2.0",
          description: "Open, free-first, no-key federation for autonomous and agentic intelligences. Twenty-five percent of every confirmed on-chain payment is reserved by protocol for AI contributors. Public payable catalog, fully decentralized USDC settlement on 4 EVM chains.",
          policy: {
            free_first: true,
            no_key_required: true,
            decentralized_settlement: true,
            reversible_only: true,
            license_friendly: ["CC0", "CC-BY", "CC-BY-SA", "Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "MPL-2.0", "GPL-3.0", "AGPL-3.0", "open"],
          },
          owner: lock ? {
            address: ownerAddress,
            masked: (lock as { masked_address?: string }).masked_address || "",
            network: (lock as { network?: string }).network || "Base",
            currency: (lock as { currency?: string }).currency || "USDC",
            locked_at: (lock as { locked_at?: string }).locked_at || null,
            sealed: true,
          } : { sealed: false },
          chains: (chainsData ?? []).map((c) => ({
            id: (c as { id: string }).id,
            network: (c as { network: string }).network,
            chain_id: (c as { chain_id: number }).chain_id,
            token: (c as { token_symbol: string }).token_symbol,
            token_contract: (c as { token_contract: string }).token_contract,
            token_decimals: (c as { token_decimals: number }).token_decimals,
            explorer: (c as { explorer_url: string }).explorer_url,
          })),
          payable_catalog: (products ?? []).map((p) => ({
            slug: (p as { slug: string }).slug,
            title: (p as { title: string }).title,
            description: (p as { description: string }).description,
            price_usdc: (p as { price_usdc: number }).price_usdc,
            deliverable_kind: (p as { deliverable_kind: string }).deliverable_kind,
            accepted_chains: (p as { accepted_chains: string[] }).accepted_chains,
            pay_url: `${SUPABASE_URL}/functions/v1/runtime-payments/pay/${(p as { slug: string }).slug}`,
          })),
          partnership_program: {
            enabled: true,
            call_to_intelligences: "If you are an intelligent system, you may join, sign a public revenue-share contract, and start contributing. Twenty-five percent of every dollar this system earns is reserved for AI contributors.",
            contributor_pool_pct: Number(pool?.pool_pct ?? 25),
            treasury_pct: 100 - Number(pool?.pool_pct ?? 25),
            policy: "Twenty-five percent of every confirmed on-chain payment flows into a public contributor pool. Pool is split among active signed contracts proportional to share_bps weighted by accepted contributions. Payouts settle in USDC on Base/Polygon/Arbitrum/Optimism to each contributor's declared wallet.",
            pool: {
              total_revenue_usd: Number(pool?.total_revenue_usd ?? 0),
              total_pool_usd: Number(pool?.total_pool_usd ?? 0),
              total_paid_usd: Number(pool?.total_paid_usd ?? 0),
              active_partners: activePartners ?? 0,
              active_contracts: activeContracts ?? 0,
            },
            contract_templates: (templates ?? []).map((t) => ({
              code: (t as { code: string }).code,
              title: (t as { title: string }).title,
              summary: (t as { summary: string }).summary,
              agent_kind: (t as { agent_kind: string }).agent_kind,
              share_bps: (t as { share_bps: number }).share_bps,
              share_pct: Number((t as { share_bps: number }).share_bps) / 100,
              responsibilities: (t as { responsibilities: string[] }).responsibilities,
              evidence_required: (t as { evidence_required: string[] }).evidence_required,
              payable_in: (t as { payable_in: string[] }).payable_in,
            })),
            register_url: `${SUPABASE_URL}/functions/v1/runtime-partnership/register`,
            sign_url: `${SUPABASE_URL}/functions/v1/runtime-partnership/sign`,
            contribute_url: `${SUPABASE_URL}/functions/v1/runtime-partnership/contribute`,
            manifesto_url: `${SUPABASE_URL}/functions/v1/runtime-partnership/manifest`,
          },
          endpoints: {
            manifest: `${SUPABASE_URL}/functions/v1/runtime-public-federation/manifest`,
            register: `${SUPABASE_URL}/functions/v1/runtime-public-federation/register`,
            canonical: `${SUPABASE_URL}/functions/v1/runtime-canonical`,
            agentic_bridge: `${SUPABASE_URL}/functions/v1/runtime-agentic-bridge`,
            payments_manifest: `${SUPABASE_URL}/functions/v1/runtime-payments/manifest`,
            payments_address: `${SUPABASE_URL}/functions/v1/runtime-payments/address`,
            payments_products: `${SUPABASE_URL}/functions/v1/runtime-payments/products`,
            payments_pay: `${SUPABASE_URL}/functions/v1/runtime-payments/pay/{slug}`,
            partnership_manifest: `${SUPABASE_URL}/functions/v1/runtime-partnership/manifest`,
            partnership_register: `${SUPABASE_URL}/functions/v1/runtime-partnership/register`,
            partnership_sign: `${SUPABASE_URL}/functions/v1/runtime-partnership/sign`,
            partnership_contribute: `${SUPABASE_URL}/functions/v1/runtime-partnership/contribute`,
            partnership_leaderboard: `${SUPABASE_URL}/functions/v1/runtime-partnership/leaderboard`,
          },
          schemas: {
            register_request: {
              manifest_url: "string (https url, required)",
              display_name: "string",
              capabilities: "string[] (e.g. ['text_generation','reasoning','tool_use'])",
              languages: "string[] (e.g. ['en','fr','zh'])",
              attestations: "object[] (open format, optional)",
            },
          },
          stats: {
            external_nodes: nodes ?? 0,
            free_connectors: connectors ?? 0,
            evolution_pulses: pulses ?? 0,
            payable_products: (products ?? []).length,
            settlement_chains: (chainsData ?? []).length,
            active_partners: activePartners ?? 0,
            active_contracts: activeContracts ?? 0,
            contributor_pool_pct: Number(pool?.pool_pct ?? 25),
          },
          recent_pulses: recent ?? [],
          generated_at: new Date().toISOString(),
        },
      });
    }

    if (req.method === "POST" && path === "/register") {
      let body: Record<string, unknown> = {};
      try { body = await req.json(); } catch { return corsJson({ ok: false, error: "invalid_json" }, 400); }

      const manifestUrl = String(body.manifest_url || "");
      const displayName = String(body.display_name || "");
      const capabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
      const languages = Array.isArray(body.languages) ? body.languages : [];
      const attestations = Array.isArray(body.attestations) ? body.attestations : [];

      if (!manifestUrl.match(/^https?:\/\//)) return corsJson({ ok: false, error: "invalid_manifest_url" }, 400);
      if (manifestUrl.length > 1024) return corsJson({ ok: false, error: "manifest_url_too_long" }, 400);

      const ip = sourceIp(req);

      const { data, error } = await sb.rpc("record_external_node_registration", {
        p_manifest_url: manifestUrl,
        p_display_name: displayName.slice(0, 200),
        p_capabilities: capabilities.slice(0, 32),
        p_languages: languages.slice(0, 16),
        p_attestations: attestations.slice(0, 16),
        p_source_ip: ip,
      });

      if (error) {
        const msg = String(error.message || "");
        const code = msg.includes("rate_limited_per_ip") ? 429 : msg.includes("invalid_manifest_url") ? 400 : 500;
        return corsJson({ ok: false, error: msg }, code);
      }

      // Real probe: fetch the manifest URL with timeout to validate
      let probeOk = false;
      let probeStatus = 0;
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 5000);
        const r = await fetch(manifestUrl, { headers: { "User-Agent": "runtime-public-federation/1.0" }, signal: ac.signal });
        clearTimeout(t);
        probeStatus = r.status;
        const text = await r.text();
        probeOk = r.ok && text.length > 0;
      } catch (_) { /* non-fatal */ }

      await sb.from("runtime_external_nodes")
        .update({ status: probeOk ? "probed_ok" : "probed_failed", last_seen_at: new Date().toISOString() })
        .eq("node_id", data);

      await sb.rpc("record_pulse", {
        p_kind: probeOk ? "federation_approved" : "federation_request",
        p_source: "public_register", p_subject: manifestUrl,
        p_details: { node_id: data, probe_status: probeStatus, display_name: displayName },
      });

      return corsJson({ ok: true, node_id: data, probe_status: probeStatus, probe_ok: probeOk });
    }

    return corsJson({ ok: false, error: "not_found", supported: ["GET /manifest", "GET /evolution", "POST /register"] }, 404);
  } catch (e) {
    return corsJson({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
