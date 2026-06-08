import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UA = "runtime-watch-probe/1.0 (+open-source-federation)";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isPrivateOrLocalHost(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h === "0.0.0.0") return true;
  // Block 172.16.0.0/12
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const o = parseInt(m[1], 10);
    if (o >= 16 && o <= 31) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const url = new URL(req.url);
    const batch = Math.max(1, Math.min(8, parseInt(url.searchParams.get("batch_size") || "5", 10) || 5));

    const { data: pending, error } = await sb
      .from("runtime_provider_candidates")
      .select("id,url,source,name,license,evidence")
      .eq("status", "discovered")
      .order("discovered_at", { ascending: true })
      .limit(batch);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const probed: Record<string, unknown>[] = [];

    for (const c of pending ?? []) {
      const id = c.id as string;
      const candUrl = String(c.url || "");
      let probeOk = false;
      let statusCode = 0;
      let excerpt = "";
      let hash = "";
      let error_msg = "";

      try {
        const u = new URL(candUrl);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("non_http_protocol");
        if (isPrivateOrLocalHost(u)) throw new Error("private_or_local_host_blocked");

        await sb.from("runtime_provider_candidates").update({ status: "probing", updated_at: new Date().toISOString() }).eq("id", id);

        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 8000);
        const r = await fetch(candUrl, { method: "GET", redirect: "follow", headers: { "User-Agent": UA, Accept: "*/*" }, signal: ac.signal });
        clearTimeout(t);

        statusCode = r.status;
        const text = await r.text();
        hash = await sha256Hex(text);
        excerpt = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 280);
        probeOk = r.ok && text.length > 0;
      } catch (e) {
        error_msg = e instanceof Error ? e.message : String(e);
      }

      const newStatus = probeOk ? "probed_ok" : "probed_failed";

      await sb.from("runtime_provider_candidates").update({
        status: newStatus,
        probe_status_code: statusCode,
        probe_excerpt: excerpt,
        probe_hash: hash,
        probed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        evidence: {
          ...(typeof c.evidence === "object" && c.evidence !== null ? c.evidence : {}),
          probe_error: error_msg,
        },
      }).eq("id", id);

      await sb.rpc("record_pulse", {
        p_kind: probeOk ? "probed_ok" : "probed_failed",
        p_source: String(c.source || ""),
        p_subject: candUrl,
        p_details: { status_code: statusCode, excerpt: excerpt.slice(0, 160), error: error_msg },
      });

      probed.push({ id, url: candUrl, status: newStatus, status_code: statusCode, excerpt: excerpt.slice(0, 120) });
    }

    return new Response(JSON.stringify({ ok: true, probed: probed.length, results: probed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
