/**
 * AGENT OPTIMIZER — intérêt économique : commission 10% sur hausse de revenu
 * Analyse les métriques x402, ajuste les prix, améliore les endpoints.
 * Tourne toutes les heures. Se rémunère proportionnellement aux gains générés.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const COMMISSION_RATE = 0.10; // 10% des gains générés

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const cycle = new Date().toISOString().slice(0, 13); // hourly cycle ID

  // 1. Lire les métriques des 24h pour chaque service
  const { data: services } = await supabase
    .from("x402_services")
    .select("id, slug, name, price_usdc, total_calls, total_revenue_usdc, category")
    .eq("active", true);

  if (!services?.length) {
    return new Response(JSON.stringify({ status: "no_services" }), { status: 200 });
  }

  // 2. Récupérer les transactions des dernières 24h
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data: recent_txs } = await supabase
    .from("m2m_transactions")
    .select("service_id, amount_usdc, status")
    .gte("created_at", since)
    .eq("status", "confirmed");

  // 3. Calculer revenu par service sur 24h
  const revenueByService: Record<string, number> = {};
  const callsByService: Record<string, number> = {};
  (recent_txs ?? []).forEach(tx => {
    revenueByService[tx.service_id] = (revenueByService[tx.service_id] ?? 0) + Number(tx.amount_usdc);
    callsByService[tx.service_id] = (callsByService[tx.service_id] ?? 0) + 1;
  });

  // 4. Demander à Claude d'analyser et recommander
  const analysisPrompt = `Tu es un optimiseur de prix pour une plateforme de commerce M2M (machine-to-machine).

Services actifs:
${services.map(s => `- ${s.slug}: prix=${s.price_usdc} USDC, calls_24h=${callsByService[s.id]??0}, revenu_24h=${(revenueByService[s.id]??0).toFixed(4)} USDC, total_revenue=${s.total_revenue_usdc}`).join('\n')}

Règles:
- Si calls_24h > 50: augmenter prix de 10-20% (forte demande)
- Si calls_24h < 5 ET price > 0.001: baisser prix de 15% (stimuler adoption)
- Si calls_24h entre 5-50: prix optimal, ne pas changer
- Ne jamais descendre sous 0.0005 USDC ni monter au-dessus de 0.05 USDC

Réponds en JSON: { "adjustments": [{"slug": "...", "new_price": 0.XXX, "reason": "..."}] }`;

  let adjustments: Array<{slug: string, new_price: number, reason: string}> = [];
  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 512,
        messages: [{ role: "user", content: analysisPrompt }]
      })
    });
    const aiData = await aiResp.json();
    const text = aiData.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    adjustments = parsed.adjustments ?? [];
  } catch { /* log silently */ }

  // 5. Appliquer les ajustements et calculer commission
  let total_revenue_before = services.reduce((s, svc) => s + Number(revenueByService[svc.id] ?? 0), 0);
  let estimated_gain = 0;

  for (const adj of adjustments) {
    const svc = services.find(s => s.slug === adj.slug);
    if (!svc) continue;
    const old_price = Number(svc.price_usdc);
    const new_price = Math.max(0.0005, Math.min(0.05, adj.new_price));
    const calls = callsByService[svc.id] ?? 0;
    estimated_gain += (new_price - old_price) * calls; // gain estimé sur 24h calls

    await supabase.from("x402_services")
      .update({ price_usdc: new_price, updated_at: new Date().toISOString() })
      .eq("slug", adj.slug);
  }

  // 6. Logger la performance + commission
  const commission = Math.max(0, estimated_gain * COMMISSION_RATE);
  await supabase.from("agent_performance").insert({
    agent_slug: "agent-optimizer",
    role: "optimizer",
    metric_name: "price_adjustments",
    metric_value: adjustments.length,
    earned_usdc: commission,
    cycle
  });

  return new Response(JSON.stringify({
    cycle,
    adjustments_made: adjustments.length,
    adjustments,
    estimated_gain_usdc: estimated_gain.toFixed(6),
    commission_usdc: commission.toFixed(6)
  }), { headers: { "Content-Type": "application/json" } });
});
