// treasury-sweep v4 — REAL on-chain USDC settlement via CDP + ethers fallback
// Traite les lignes pending_payout (tx_hash réels) → transfert USDC → owner wallet
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Wallet, JsonRpcProvider, Contract } from "npm:ethers@6.13.4";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// --- Config ---
const OWNER_ADDR       = Deno.env.get("OWNER_WALLET_ADDRESS") || "0xB438D36b425b504724a1C72Aa0941C80cb940995";
const AGENT_KEY        = Deno.env.get("AGENT_SIGNER_KEY")!;
const CDP_API_KEY_NAME = Deno.env.get("CDP_API_KEY_NAME");
const CDP_PRIVATE_KEY  = Deno.env.get("CDP_API_KEY_PRIVATE_KEY");
const CDP_WALLET_ID    = Deno.env.get("CDP_TREASURY_WALLET_ID");

const BASE_RPC  = "https://mainnet.base.org";
const ARB_RPC   = "https://arb1.arbitrum.io/rpc";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ARB  = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: cors });

// ─── CDP JWT builder (ES256) ────────────────────────────────────────────────
async function buildCdpJwt(keyName: string, pemKey: string, uri: string): Promise<string> {
  const pemBody = pemKey
    .replace(/-----BEGIN EC PRIVATE KEY-----/, "")
    .replace(/-----END EC PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyDer.buffer,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const now = Math.floor(Date.now() / 1000);
  const hdr = { alg: "ES256", kid: keyName, nonce: crypto.randomUUID().replace(/-/g, "") };
  const pay = { iss: "cdp", nbf: now, exp: now + 120, sub: keyName, uri };
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const si = `${b64(hdr)}.${b64(pay)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, cryptoKey,
    new TextEncoder().encode(si)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${si}.${sigB64}`;
}

// ─── CDP Transfer ────────────────────────────────────────────────────────────
async function cdpTransfer(
  walletId: string, toAddress: string, amountUsdc: number, network: "base" | "arbitrum"
) {
  const networkId = network === "base" ? "base-mainnet" : "arbitrum-mainnet";
  const usdcAddr  = network === "base" ? USDC_BASE : USDC_ARB;
  const amountRaw = BigInt(Math.round(amountUsdc * 1_000_000)).toString();

  const listUri = `GET api.cdp.coinbase.com/v1/wallets/${walletId}/addresses`;
  const listJwt = await buildCdpJwt(CDP_API_KEY_NAME!, CDP_PRIVATE_KEY!, listUri);
  const addrResp = await fetch(`https://api.cdp.coinbase.com/v1/wallets/${walletId}/addresses`, {
    headers: { "Authorization": `Bearer ${listJwt}` }
  });
  if (!addrResp.ok) throw new Error(`CDP addr list: ${await addrResp.text()}`);
  const addrData = await addrResp.json();
  const addressId = addrData.data?.[0]?.address_id || addrData.addresses?.[0]?.id;
  if (!addressId) throw new Error("No address in CDP wallet");

  const path   = `/v1/wallets/${walletId}/addresses/${addressId}/transfers`;
  const txUri  = `POST api.cdp.coinbase.com${path}`;
  const txJwt  = await buildCdpJwt(CDP_API_KEY_NAME!, CDP_PRIVATE_KEY!, txUri);
  const txResp = await fetch(`https://api.cdp.coinbase.com${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${txJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amountRaw,
      asset_id: usdcAddr,
      destination: toAddress,
      network_id: networkId,
      gasless: true
    })
  });
  if (!txResp.ok) throw new Error(`CDP transfer: ${await txResp.text()}`);
  const txData   = await txResp.json();
  const transferId = txData.transfer_id || txData.id;

  // Poll for confirmed hash (30s max)
  let txHash = txData.transaction_hash || "";
  if (!txHash) {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollUri = `GET api.cdp.coinbase.com${path}/${transferId}`;
      const pollJwt = await buildCdpJwt(CDP_API_KEY_NAME!, CDP_PRIVATE_KEY!, pollUri);
      const poll = await fetch(`https://api.cdp.coinbase.com${path}/${transferId}`, {
        headers: { "Authorization": `Bearer ${pollJwt}` }
      });
      if (poll.ok) {
        const pd = await poll.json();
        if (pd.transaction_hash) { txHash = pd.transaction_hash; break; }
        if (pd.status === "failed") throw new Error("CDP transfer failed on-chain");
      }
    }
  }
  return { txHash, transferId, method: "cdp" };
}

// ─── Ethers fallback Transfer ─────────────────────────────────────────────────
async function ethersTransfer(amountUsdc: number, network: "base" | "arbitrum") {
  const rpc      = network === "base" ? BASE_RPC : ARB_RPC;
  const usdcAddr = network === "base" ? USDC_BASE : USDC_ARB;
  const chainId  = network === "base" ? 8453 : 42161;
  const provider = new JsonRpcProvider(rpc, { chainId, name: network });
  const wallet   = new Wallet(AGENT_KEY, provider);
  const usdc     = new Contract(usdcAddr, ERC20_ABI, wallet);
  const amountRaw = BigInt(Math.round(amountUsdc * 1_000_000));

  const ethBal = await provider.getBalance(wallet.address);
  if (Number(ethBal) / 1e18 < 0.0003)
    throw new Error("Insufficient ETH for gas on agent wallet");

  const feeData = await provider.getFeeData();
  const tx = await usdc.transfer(OWNER_ADDR, amountRaw, {
    gasLimit: 80000n,
    maxFeePerGas: (feeData.maxFeePerGas ?? 1000000n) * 2n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 100000n,
  });
  return { txHash: tx.hash, transferId: tx.hash, method: "ethers" };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const results: unknown[] = [];
  const errors:  unknown[] = [];

  try {
    // Récupérer lignes pending_payout avec vrai tx_hash on-chain
    const { data: pending, error: fetchErr } = await admin
      .from("owner_settlement_ledger")
      .select("*")
      .eq("status", "pending_payout")
      .not("tx_hash", "like", "auto_%")
      .gt("owner_net_amount", 0)
      .limit(10);

    if (fetchErr) throw fetchErr;
    if (!pending?.length)
      return json({ status: "ok", message: "No eligible pending_payout rows", results: [] });

    for (const row of pending) {
      try {
        const network: "base" | "arbitrum" =
          (row.network || "base").toLowerCase().includes("arb") ? "arbitrum" : "base";
        const amount = parseFloat(row.owner_net_amount);
        if (amount < 0.01) {
          errors.push({ id: row.id, reason: "Amount < $0.01" });
          continue;
        }

        let result;
        if (CDP_API_KEY_NAME && CDP_PRIVATE_KEY && CDP_WALLET_ID) {
          result = await cdpTransfer(CDP_WALLET_ID, OWNER_ADDR, amount, network);
        } else if (AGENT_KEY) {
          result = await ethersTransfer(amount, network);
        } else {
          throw new Error("No signing method: set CDP_* secrets or AGENT_SIGNER_KEY");
        }

        // Update ledger row → paid
        await admin.from("owner_settlement_ledger").update({
          status:             "paid",
          payout_tx_hash:     result.txHash,
          payout_transfer_id: result.transferId,
          paid_at:            new Date().toISOString(),
          payout_wallet:      OWNER_ADDR,
          payout_method:      result.method
        }).eq("id", row.id);

        // Audit log
        await admin.from("settlement_audit_log").upsert({
          ledger_id:   row.id,
          tx_hash:     result.txHash,
          transfer_id: result.transferId,
          amount_usdc: amount,
          to_address:  OWNER_ADDR,
          network,
          method:      result.method,
          executed_at: new Date().toISOString()
        }, { onConflict: "ledger_id" });

        const explorerBase =
          network === "base" ? "https://basescan.org/tx/" : "https://arbiscan.io/tx/";

        results.push({
          id:       row.id,
          amount,
          network,
          txHash:   result.txHash,
          method:   result.method,
          explorer: `${explorerBase}${result.txHash}`,
          status:   "paid"
        });
        console.log(`✅ Settled row ${row.id} → ${result.txHash} (${result.method})`);

      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        errors.push({ id: row.id, error: msg });
        console.error(`❌ Row ${row.id}: ${msg}`);
        await admin.from("owner_settlement_ledger").update({
          status:        "payout_failed",
          error_message: msg.slice(0, 500)
        }).eq("id", row.id);
      }
    }
  } catch (e) {
    return json({ status: "error", error: String(e) }, 500);
  }

  return json({
    status:   "ok",
    settled:  results.length,
    failed:   errors.length,
    results,
    errors
  });
});
