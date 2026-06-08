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

type ChainRow = {
  id: string;
  network: string;
  chain_id: number;
  token_symbol: string;
  token_contract: string;
  token_decimals: number;
  watch_address: string;
  active: boolean;
  public_rpcs: string[];
  explorer_url: string;
};

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  price_usdc: number;
  deliverable_kind: string;
  accepted_chains: string[];
  active: boolean;
  display_order: number;
  metadata: Record<string, unknown>;
};

function buildEip681(chain: ChainRow, address: string, amount: number): string {
  const baseUnits = Math.round(amount * 10 ** chain.token_decimals);
  return `ethereum:${chain.token_contract}@${chain.chain_id}/transfer?address=${address}&uint256=${baseUnits}`;
}

function buildPayPaths(chains: ChainRow[], address: string, amount: number) {
  return chains.filter((c) => c.active).map((c) => ({
    network: c.network,
    chain_id: c.chain_id,
    token: c.token_symbol,
    token_contract: c.token_contract,
    eip681: buildEip681(c, address, amount),
    explorer: `${c.explorer_url}/token/${c.token_contract}?a=${address}`,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/runtime-payments/, "") || "/";

    const { data: chainsData } = await sb
      .from("payment_chains")
      .select("id,network,chain_id,token_symbol,token_contract,token_decimals,watch_address,active,public_rpcs,explorer_url")
      .eq("active", true)
      .order("chain_id", { ascending: true });
    const chains = (chainsData ?? []) as ChainRow[];

    const baseChain = chains.find((c) => c.id === "base");
    const watchAddress = String(baseChain?.watch_address || "").toLowerCase();
    if (!watchAddress.startsWith("0x") || watchAddress.length !== 42) {
      return corsJson({ ok: false, error: "owner_wallet_not_configured" }, 503);
    }

    if (req.method === "GET" && (path === "/" || path === "/manifest")) {
      const { data: lock } = await sb.from("owner_wallet_lock").select("masked_address,network,currency,locked_at").maybeSingle();
      const { data: products } = await sb
        .from("payment_products")
        .select("slug,title,description,price_usdc,deliverable_kind,accepted_chains,display_order")
        .eq("active", true)
        .order("display_order", { ascending: true });
      return corsJson({
        ok: true,
        decentralized: true,
        no_key_required: true,
        owner: {
          address: watchAddress,
          masked: (lock as { masked_address?: string } | null)?.masked_address || "",
          locked_at: (lock as { locked_at?: string } | null)?.locked_at || null,
        },
        chains: chains.map((c) => ({
          id: c.id, network: c.network, chain_id: c.chain_id,
          token: c.token_symbol, token_contract: c.token_contract, token_decimals: c.token_decimals,
          public_rpcs: c.public_rpcs, explorer: c.explorer_url,
        })),
        products: (products ?? []).map((p) => ({
          slug: p.slug,
          title: p.title,
          description: p.description,
          price_usdc: p.price_usdc,
          deliverable_kind: p.deliverable_kind,
          accepted_chains: p.accepted_chains,
          pay_url: `${SUPABASE_URL}/functions/v1/runtime-payments/pay/${p.slug}`,
        })),
        endpoints: {
          address: `${SUPABASE_URL}/functions/v1/runtime-payments/address`,
          products: `${SUPABASE_URL}/functions/v1/runtime-payments/products`,
          pay: `${SUPABASE_URL}/functions/v1/runtime-payments/pay/{slug}`,
          create: `${SUPABASE_URL}/functions/v1/runtime-payments/create`,
          status: `${SUPABASE_URL}/functions/v1/runtime-payments/status/{reference}`,
          recent: `${SUPABASE_URL}/functions/v1/runtime-payments/recent`,
        },
        generated_at: new Date().toISOString(),
      });
    }

    if (req.method === "GET" && path === "/address") {
      const { data: lock } = await sb.from("owner_wallet_lock").select("masked_address,network,currency,locked_at").maybeSingle();
      return corsJson({
        ok: true,
        address: watchAddress,
        masked: (lock as { masked_address?: string } | null)?.masked_address || "",
        network: "Base",
        chain_id: 8453,
        currency: "USDC",
        token_contract: baseChain?.token_contract || "",
        token_decimals: baseChain?.token_decimals || 6,
        locked_at: (lock as { locked_at?: string } | null)?.locked_at || null,
        decentralized: true,
        no_key_required: true,
      });
    }

    if (req.method === "GET" && path === "/chains") {
      return corsJson({ ok: true, chains });
    }

    if (req.method === "GET" && path === "/products") {
      const { data: products } = await sb
        .from("payment_products")
        .select("slug,title,description,price_usdc,deliverable_kind,accepted_chains,display_order")
        .eq("active", true)
        .order("display_order", { ascending: true });
      return corsJson({
        ok: true,
        products: (products ?? []).map((p) => ({
          slug: p.slug,
          title: p.title,
          description: p.description,
          price_usdc: p.price_usdc,
          deliverable_kind: p.deliverable_kind,
          accepted_chains: p.accepted_chains,
          pay_url: `${SUPABASE_URL}/functions/v1/runtime-payments/pay/${p.slug}`,
        })),
      });
    }

    if (req.method === "GET" && path.startsWith("/pay/")) {
      const slug = path.replace("/pay/", "");
      const { data: product } = await sb
        .from("payment_products")
        .select("slug,title,description,price_usdc,deliverable_kind,accepted_chains")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (!product) return corsJson({ ok: false, error: "product_not_found" }, 404);
      const p = product as ProductRow;
      const acceptedChains = chains.filter((c) => p.accepted_chains.includes(c.network));

      const { data: created, error } = await sb
        .from("payment_intents")
        .insert({
          amount_usdc: p.price_usdc,
          description: p.title,
          network: "Base",
          currency: "USDC",
          destination: watchAddress,
          status: "pending",
          metadata: { product_slug: p.slug, deliverable_kind: p.deliverable_kind },
        })
        .select("reference,amount_usdc,description,status,expires_at,created_at,destination")
        .maybeSingle();
      if (error || !created) return corsJson({ ok: false, error: error?.message || "intent_failed" }, 500);

      const intent = created as { reference: string; destination?: string };
      await sb.rpc("record_pulse", {
        p_kind: "heartbeat",
        p_source: "payment_offer",
        p_subject: p.slug,
        p_details: { reference: intent.reference, amount_usdc: p.price_usdc, chains: acceptedChains.map((c) => c.network) },
      });

      return corsJson({
        ok: true,
        product: { slug: p.slug, title: p.title, description: p.description, price_usdc: p.price_usdc, deliverable_kind: p.deliverable_kind },
        intent: created,
        pay_options: buildPayPaths(acceptedChains, watchAddress, p.price_usdc),
        receiving_address: watchAddress,
        status_url: `${SUPABASE_URL}/functions/v1/runtime-payments/status/${intent.reference}`,
      });
    }

    if (req.method === "GET" && path.startsWith("/status/")) {
      const ref = path.replace("/status/", "");
      const { data: intent } = await sb
        .from("payment_intents")
        .select("id,reference,amount_usdc,description,status,expires_at,matched_tx_hash,matched_at,created_at,metadata,destination")
        .eq("reference", ref)
        .maybeSingle();
      if (!intent) return corsJson({ ok: false, error: "intent_not_found" }, 404);
      const { data: receipts } = await sb
        .from("onchain_payments")
        .select("network,tx_hash,amount_usd,from_address,block_number,confirmed_at")
        .eq("intent_id", (intent as { id: string }).id)
        .order("confirmed_at", { ascending: false });
      return corsJson({ ok: true, intent, receipts: receipts ?? [], receiving_address: watchAddress });
    }

    if (req.method === "GET" && path === "/recent") {
      const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
      const { data: payments } = await sb
        .from("onchain_payments")
        .select("network,tx_hash,amount_usd,from_address,destination,block_number,confirmed_at,intent_id")
        .order("confirmed_at", { ascending: false })
        .limit(limit);
      return corsJson({ ok: true, payments: payments ?? [] });
    }

    if (req.method === "POST" && (path === "/" || path === "/create")) {
      let body: Record<string, unknown> = {};
      try { body = await req.json(); } catch { return corsJson({ ok: false, error: "invalid_json" }, 400); }
      const amount = Number(body.amount_usdc);
      const description = String(body.description || "").slice(0, 240);
      const expiresInSec = Math.min(86400 * 7, Math.max(60, Number(body.expires_in_sec || 86400)));
      const metadata = (typeof body.metadata === "object" && body.metadata !== null) ? body.metadata : {};
      if (!isFinite(amount) || amount <= 0 || amount > 1_000_000) return corsJson({ ok: false, error: "invalid_amount" }, 400);

      const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
      const { data: created, error } = await sb
        .from("payment_intents")
        .insert({
          amount_usdc: amount, description, network: "Base", currency: "USDC",
          destination: watchAddress, status: "pending", expires_at: expiresAt, metadata,
        })
        .select("id,reference,amount_usdc,description,status,expires_at,destination,created_at")
        .maybeSingle();
      if (error || !created) return corsJson({ ok: false, error: error?.message || "insert_failed" }, 500);

      return corsJson({
        ok: true,
        intent: created,
        pay_options: buildPayPaths(chains, watchAddress, amount),
        receiving_address: watchAddress,
        status_url: `${SUPABASE_URL}/functions/v1/runtime-payments/status/${(created as { reference: string }).reference}`,
      });
    }

    return corsJson({
      ok: false,
      error: "not_found",
      supported: [
        "GET /manifest", "GET /address", "GET /chains", "GET /products",
        "GET /pay/:slug", "POST /create", "GET /status/:reference", "GET /recent?limit=20",
      ],
    }, 404);
  } catch (e) {
    return corsJson({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
