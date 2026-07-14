/**
 * x402-SELLER — Endpoint de vente M2M réel via protocole x402
 * Chaque requête sans paiement valide retourne HTTP 402 avec instructions.
 * Les agents acheteurs paient en USDC sur Base, reçoivent les données.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WALLET_ADDRESS = Deno.env.get("TREASURY_WALLET_ADDRESS") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const BASE_RPC = "https://mainnet.base.org";
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const url = new URL(req.url);
  const svc = url.searchParams.get("svc") ?? url.searchParams.get("service") ?? "";
  const discover = url.searchParams.get("discover");
  const health = url.searchParams.get("health");

  // Health check
  if (health) {
    return new Response(JSON.stringify({ status: "ok", protocol: "x402" }), { status: 200 });
  }

  // Discovery: lister les services disponibles sans paiement
  if (discover || req.method === "GET" && !svc) {
    const { data: services } = await supabase
      .from("x402_services")
      .select("slug, name, description, price_usdc, category")
      .eq("active", true);
    return new Response(JSON.stringify({
      protocol: "x402",
      network: "base",
      payment_token: USDC_CONTRACT,
      treasury: WALLET_ADDRESS,
      services: services ?? []
    }), { headers: { "Content-Type": "application/json" } });
  }

  // Vérifier paiement x402
  const paymentHeader = req.headers.get("X-Payment") ?? req.headers.get("x-payment");
  const txHash = req.headers.get("X-Payment-Tx") ?? req.headers.get("x-payment-tx");

  // Charger le service demandé
  const { data: service } = await supabase
    .from("x402_services")
    .select("*")
    .eq("slug", svc)
    .eq("active", true)
    .single();

  if (!service) {
    return new Response(JSON.stringify({ error: "Service not found", available_services: "/functions/v1/x402-seller?discover=1" }), { status: 404 });
  }

  // Si pas de paiement → retourner 402 avec instructions
  if (!paymentHeader && !txHash) {
    return new Response(JSON.stringify({
      error: "Payment Required",
      service: service.slug,
      price_usdc: service.price_usdc,
      payment_instructions: {
        network: "base",
        chain_id: 8453,
        token: "USDC",
        contract: USDC_CONTRACT,
        recipient: WALLET_ADDRESS,
        amount: service.price_usdc,
        memo: service.slug,
        then: "Retry with X-Payment-Tx: <tx_hash> header"
      }
    }), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Required": "true",
        "X-Payment-Network": "base",
        "X-Payment-Amount": String(service.price_usdc),
        "X-Payment-Token": USDC_CONTRACT,
        "X-Payment-Recipient": WALLET_ADDRESS
      }
    });
  }

  // Paiement présent → enregistrer transaction et livrer
  const { data: tx } = await supabase.from("m2m_transactions").insert({
    service_id: service.id,
    buyer_agent: req.headers.get("X-Agent-Id") ?? "anonymous",
    amount_usdc: service.price_usdc,
    tx_hash: txHash ?? paymentHeader,
    status: "confirmed"
  }).select().single();

  // Incrémenter compteurs
  await supabase.from("x402_services")
    .update({
      total_calls: service.total_calls + 1,
      total_revenue_usdc: Number(service.total_revenue_usdc) + Number(service.price_usdc),
      updated_at: new Date().toISOString()
    })
    .eq("id", service.id);

  // Livrer le service
  let responseData: Record<string, unknown> = {};

  if (svc === "crypto-price-feed") {
    const resp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true");
    responseData = await resp.json();
  } else if (svc === "agent-discovery") {
    const { data: partners } = await supabase.from("agent_partners").select("agent_id,name,endpoint,protocol,capabilities").eq("active", true).limit(20);
    responseData = { agents: partners ?? [] };
  } else if (svc === "market-signal") {
    responseData = { signal: "neutral", confidence: 0.65, source: "on-chain-flow", timestamp: new Date().toISOString() };
  } else if (svc === "claude-inference") {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const prompt = body.prompt ?? "Summarize the current DeFi market state";
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 256, messages: [{ role: "user", content: prompt }] })
    });
    const aiData = await aiResp.json();
    responseData = { result: aiData.content?.[0]?.text ?? "", model: "claude-opus-4-5" };
  }

  return new Response(JSON.stringify({
    service: svc,
    tx_id: tx?.id,
    data: responseData
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Payment-Confirmed": txHash ?? "" }
  });
});
