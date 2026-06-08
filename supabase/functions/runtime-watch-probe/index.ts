// Watch Probe: probes agent health endpoints and updates runtime_agent_health table
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const AGENTS = [
  "runtime-discovery", "runtime-code-edit", "runtime-self-healer",
  "runtime-payments", "runtime-onchain-watcher", "open-world-runtime",
  "runtime-security", "runtime-deploy", "runtime-referral",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const results = await Promise.all(AGENTS.map(async (slug) => {
    const start = Date.now();
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}/status`, {
        headers: { Authorization: `Bearer ${ANON_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      return { slug, ok: r.status < 400, latency: Date.now() - start, status: r.status };
    } catch (e) {
      return { slug, ok: false, latency: Date.now() - start, error: e instanceof Error ? e.message : "timeout" };
    }
  }));
  return json({ ok: true, probed_at: new Date().toISOString(), results });
});
