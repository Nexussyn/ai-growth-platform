import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_BLOCK_RANGE = 800;
const CONFIRMATIONS = 1;
const SEED_BACKWINDOW = 200;

function topicForAddress(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, "");
  return "0x" + a.padStart(64, "0");
}
function hexToBigInt(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}
function addrFromTopic(topic: string): string {
  if (!topic) return "";
  const t = topic.toLowerCase().replace(/^0x/, "");
  return "0x" + t.slice(-40);
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
  last_scanned_block: number;
  public_rpcs: string[];
};

type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: string;
};

async function rpcCall<T>(rpcs: string[], method: string, params: unknown[], timeoutMs = 9000): Promise<{ result: T; rpc: string } | { error: string }> {
  let lastError = "no_rpc";
  for (const url of rpcs) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      clearTimeout(t);
      if (!r.ok) { lastError = `http_${r.status}`; continue; }
      const j = await r.json().catch(() => null);
      if (!j || j.error) { lastError = j?.error?.message ? String(j.error.message) : "rpc_error"; continue; }
      return { result: j.result as T, rpc: url };
    } catch (e) {
      clearTimeout(t);
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
  }
  return { error: lastError };
}

async function scanChain(sb: ReturnType<typeof createClient>, chain: ChainRow) {
  const rpcs = (chain.public_rpcs || []).filter((u) => /^https?:\/\//.test(u));
  if (rpcs.length === 0) return { chain: chain.network, ok: false, error: "no_rpcs" };
  const watchAddress = String(chain.watch_address || "").toLowerCase();
  if (!watchAddress.startsWith("0x") || watchAddress.length !== 42) return { chain: chain.network, ok: false, error: "invalid_watch_address" };

  const latestRes = await rpcCall<string>(rpcs, "eth_blockNumber", []);
  if ("error" in latestRes) return { chain: chain.network, ok: false, error: `block_number:${latestRes.error}` };
  const latest = Number(hexToBigInt(latestRes.result));
  const safeLatest = Math.max(0, latest - CONFIRMATIONS);

  let from = Number(chain.last_scanned_block || 0);
  if (from === 0) from = Math.max(1, safeLatest - SEED_BACKWINDOW);
  if (from > safeLatest) {
    await sb.from("payment_chains").update({ last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", chain.id);
    return { chain: chain.network, ok: true, scanned: 0, latest: safeLatest, from };
  }
  const to = Math.min(safeLatest, from + MAX_BLOCK_RANGE);

  const filter = {
    fromBlock: "0x" + from.toString(16),
    toBlock: "0x" + to.toString(16),
    address: chain.token_contract,
    topics: [TRANSFER_TOPIC, null, topicForAddress(watchAddress)],
  };

  const logsRes = await rpcCall<RpcLog[]>(rpcs, "eth_getLogs", [filter]);
  if ("error" in logsRes) return { chain: chain.network, ok: false, error: `get_logs:${logsRes.error}`, from, to };

  const logs = logsRes.result || [];
  let inserted = 0;
  let matchedIntents = 0;

  for (const log of logs) {
    const fromAddr = addrFromTopic(log.topics[1] || "");
    const toAddr = addrFromTopic(log.topics[2] || "");
    const amountRaw = hexToBigInt(log.data);
    const amountUsd = Number(amountRaw) / 10 ** chain.token_decimals;
    const blockNumber = Number(hexToBigInt(log.blockNumber));
    const logIndex = Number(hexToBigInt(log.logIndex));
    const txHash = log.transactionHash;
    const blockHash = log.blockHash;

    const { error: insErr } = await sb.from("onchain_payments").insert({
      network: chain.network,
      chain_id: chain.chain_id,
      token_contract: chain.token_contract,
      tx_hash: txHash,
      log_index: logIndex,
      block_number: blockNumber,
      block_hash: blockHash,
      from_address: fromAddr,
      destination: toAddr,
      amount_raw: amountRaw.toString(),
      amount_usd: amountUsd,
      status: "confirmed",
      raw_log: log as unknown as Record<string, unknown>,
    });

    if (insErr) {
      if (!String(insErr.message || "").includes("duplicate") && String(insErr.code || "") !== "23505") {
        await sb.rpc("record_pulse", {
          p_kind: "heartbeat", p_source: "onchain_watcher", p_subject: "insert_failed",
          p_details: { network: chain.network, tx: txHash, error: insErr.message },
        });
      }
      continue;
    }
    inserted++;

    const { data: matched } = await sb
      .from("payment_intents")
      .select("id, amount_usdc, reference")
      .eq("status", "pending")
      .eq("amount_usdc", amountUsd)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(1);

    if (matched && matched.length > 0) {
      const intent = matched[0] as { id: string };
      await sb.from("payment_intents").update({
        status: "matched", matched_tx_hash: txHash, matched_at: new Date().toISOString(),
      }).eq("id", intent.id).eq("status", "pending");
      await sb.from("onchain_payments").update({ intent_id: intent.id }).eq("tx_hash", txHash).eq("log_index", logIndex);
      matchedIntents++;
    }

    await sb.rpc("record_pulse", {
      p_kind: "profit_received",
      p_source: "onchain_watcher",
      p_subject: txHash,
      p_details: { network: chain.network, amount_usd: amountUsd, from: fromAddr, to: toAddr, block: blockNumber, intent_matched: !!(matched && matched[0]) },
    });
  }

  await sb.from("payment_chains").update({
    last_scanned_block: to,
    last_scan_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", chain.id);

  // Mirror Base into legacy chain_watch_state for backward compat with any UI/clients still reading it
  if (chain.id === "base") {
    await sb.from("chain_watch_state").update({
      last_scanned_block: to, last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", "base-usdc");
  }

  return { chain: chain.network, ok: true, from, to, latest: safeLatest, logs: logs.length, inserted, matched_intents: matchedIntents };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const url = new URL(req.url);
    const onlyChain = url.searchParams.get("chain");

    let q = sb.from("payment_chains")
      .select("id,network,chain_id,token_symbol,token_contract,token_decimals,watch_address,active,last_scanned_block,public_rpcs")
      .eq("active", true);
    if (onlyChain) q = q.eq("id", onlyChain);

    const { data: chains, error } = await q;
    if (error || !chains || chains.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: error?.message || "no_active_chains" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown>[] = [];
    for (const c of chains as ChainRow[]) {
      try {
        const r = await scanChain(sb, c);
        results.push(r as Record<string, unknown>);
      } catch (e) {
        results.push({ chain: c.network, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const totalInserted = results.reduce((acc, r) => acc + (Number((r as { inserted?: number }).inserted) || 0), 0);
    const totalMatched = results.reduce((acc, r) => acc + (Number((r as { matched_intents?: number }).matched_intents) || 0), 0);

    return new Response(JSON.stringify({ ok: true, scanned_chains: chains.length, total_inserted: totalInserted, total_matched: totalMatched, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
