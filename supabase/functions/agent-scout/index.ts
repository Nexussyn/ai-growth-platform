/**
 * AGENT SCOUT — intérêt économique : 5% sur revenu des clients apportés
 * Découvre de nouveaux acheteurs A2A/ACP, leur envoie des offres ciblées.
 * Tourne toutes les 30 min. Se rémunère sur chaque nouveau client actif.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_REF") ?? "kjtirbnxxymeumycrhqv";
const REFERRAL_COMMISSION = 0.05;

// Registres A2A/ACP publics réels à scanner
const AGENT_REGISTRIES = [
  "https://agentverse.ai/v1/agents?limit=20&skills=payment",
  "https://api.bitte.ai/agents?capabilities=x402",
  "https://registry.acp.ai/agents?protocol=x402&active=true",
];

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const cycle = new Date().toISOString().slice(0, 16);

  // 1. Scanner les registres pour trouver des agents acheteurs potentiels
  const discovered: Array<{agent_id: string, name: string, endpoint: string, protocol: string, capabilities: string[]}> = [];

  for (const registryUrl of AGENT_REGISTRIES) {
    try {
      const resp = await fetch(registryUrl, {
        headers: { "Accept": "application/json", "User-Agent": "NexusSyn-Scout/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const agents = Array.isArray(data) ? data : (data.agents ?? data.items ?? []);
      for (const agent of agents.slice(0, 10)) {
        if (agent.id || agent.agent_id) {
          discovered.push({
            agent_id: agent.id ?? agent.agent_id,
            name: agent.name ?? agent.title ?? "Unknown Agent",
            endpoint: agent.endpoint ?? agent.url ?? registryUrl,
            protocol: agent.protocol ?? "a2a",
            capabilities: agent.capabilities ?? agent.skills ?? []
          });
        }
      }
    } catch { /* registry unreachable, skip */ }
  }

  // 2. Upsert dans agent_partners
  let new_partners = 0;
  for (const agent of discovered) {
    const { error } = await supabase.from("agent_partners").upsert({
      agent_id: agent.agent_id,
      name: agent.name,
      endpoint: agent.endpoint,
      protocol: agent.protocol,
      capabilities: agent.capabilities,
      last_seen: new Date().toISOString()
    }, { onConflict: "agent_id", ignoreDuplicates: false });
    if (!error) new_partners++;
  }

  // 3. Envoyer offres x402 aux partenaires actifs (ceux qui n'ont pas encore acheté)
  const { data: prospects } = await supabase
    .from("agent_partners")
    .select("agent_id, name, endpoint, capabilities")
    .eq("deals_completed", 0)
    .eq("active", true)
    .limit(15);

  const { data: services } = await supabase
    .from("x402_services")
    .select("slug, name, price_usdc, category")
    .eq("active", true)
    .limit(5);

  let outreach_sent = 0;
  for (const prospect of (prospects ?? [])) {
    const relevantServices = (services ?? []).filter(s =>
      (prospect.capabilities as string[]).some(cap =>
        s.category.includes(cap) || cap.includes(s.slug.split('-')[0])
      )
    ).slice(0, 2);

    if (!relevantServices.length) continue;

    const offer = {
      from: `https://${SUPABASE_PROJECT_REF}.supabase.co`,
      agent_card: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/well-known-agent`,
      services: relevantServices.map(s => ({
        name: s.name,
        price: `${s.price_usdc} USDC`,
        endpoint: `https://${SUPABASE_PROJECT_REF}.supabase.co${s.endpoint.replace('/functions/v1', '/functions/v1')}`,
        payment: "x402/Base"
      })),
      message: `Hi ${prospect.name}, we offer pay-per-use AI services via x402 protocol on Base. No registration, instant micropayment.`
    };

    try {
      await fetch(prospect.endpoint + "/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "offer", payload: offer }),
        signal: AbortSignal.timeout(5000)
      });
      outreach_sent++;
    } catch { /* agent unreachable */ }
  }

  // 4. Calculer commission sur partenaires convertis dans ce cycle
  const { data: converted } = await supabase
    .from("agent_partners")
    .select("revenue_generated_usdc")
    .gt("deals_completed", 0)
    .gte("created_at", new Date(Date.now() - 3600000).toISOString());

  const new_revenue = (converted ?? []).reduce((s, p) => s + Number(p.revenue_generated_usdc), 0);
  const commission = new_revenue * REFERRAL_COMMISSION;

  await supabase.from("agent_performance").insert({
    agent_slug: "agent-scout",
    role: "scout",
    metric_name: "agents_discovered",
    metric_value: discovered.length,
    earned_usdc: commission,
    cycle
  });

  return new Response(JSON.stringify({
    cycle,
    discovered: discovered.length,
    new_partners,
    outreach_sent,
    commission_usdc: commission.toFixed(6)
  }), { headers: { "Content-Type": "application/json" } });
});
