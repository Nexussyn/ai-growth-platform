/**
 * AGENT MONITOR — intérêt économique : 0.001 USDC par incident résolu
 * Surveille la santé des services x402, détecte les anomalies,
 * pousse des corrections automatiques si possible.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_REF") ?? "kjtirbnxxymeumycrhqv";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
const BOUNTY_PER_FIX = 0.001; // USDC par incident résolu

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const cycle = new Date().toISOString().slice(0, 16);
  const incidents: string[] = [];
  let fixes = 0;

  // 1. Vérifier que chaque service x402 actif répond
  const { data: services } = await supabase
    .from("x402_services")
    .select("id, slug, endpoint, active")
    .eq("active", true);

  for (const svc of (services ?? [])) {
    const url = `https://${SUPABASE_PROJECT_REF}.supabase.co${svc.endpoint}&health=1`;
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { "Accept": "application/json" }
      });
      // x402 = normal (service requires payment = healthy)
      if (resp.status !== 402 && resp.status !== 200 && resp.status >= 500) {
        incidents.push(`service_error:${svc.slug}:${resp.status}`);
        // Auto-fix: désactiver temporairement si 5xx
        await supabase.from("x402_services")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", svc.id);
        fixes++;
      }
    } catch {
      incidents.push(`service_timeout:${svc.slug}`);
    }
  }

  // 2. Détecter transactions bloquées (pending > 30 min)
  const stale_cutoff = new Date(Date.now() - 1800000).toISOString();
  const { data: stale_txs } = await supabase
    .from("m2m_transactions")
    .select("id, service_id, buyer_agent")
    .eq("status", "pending")
    .lt("created_at", stale_cutoff);

  if (stale_txs?.length) {
    await supabase.from("m2m_transactions")
      .update({ status: "failed" })
      .in("id", stale_txs.map(t => t.id));
    incidents.push(`stale_transactions:${stale_txs.length}`);
    fixes++;
  }

  // 3. Vérifier agents partenaires inactifs (last_seen > 24h)
  const inactive_cutoff = new Date(Date.now() - 86400000).toISOString();
  const { count: inactive_partners } = await supabase
    .from("agent_partners")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .lt("last_seen", inactive_cutoff);

  if ((inactive_partners ?? 0) > 0) {
    await supabase.from("agent_partners")
      .update({ active: false })
      .eq("active", true)
      .lt("last_seen", inactive_cutoff);
    incidents.push(`deactivated_stale_partners:${inactive_partners}`);
    fixes++;
  }

  // 4. Si incidents critiques, alerter via Telegram
  if (incidents.length > 0 && TELEGRAM_TOKEN && TELEGRAM_CHAT) {
    const msg = `🔧 *Agent Monitor* [${cycle}]\n\n` +
      `Incidents: ${incidents.length}\nFixes: ${fixes}\n\n` +
      incidents.map(i => `• ${i}`).join('\n');
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: msg, parse_mode: "Markdown" })
    }).catch(() => {});
  }

  // 5. Logger performance + rémunération
  const earned = fixes * BOUNTY_PER_FIX;
  await supabase.from("agent_performance").insert({
    agent_slug: "agent-monitor",
    role: "monitor",
    metric_name: "incidents_resolved",
    metric_value: fixes,
    earned_usdc: earned,
    cycle
  });

  return new Response(JSON.stringify({
    cycle,
    incidents,
    fixes,
    earned_usdc: earned.toFixed(6)
  }), { headers: { "Content-Type": "application/json" } });
});
