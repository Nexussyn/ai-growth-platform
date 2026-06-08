import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * runtime-mcp-server
 * Model Context Protocol (MCP) HTTP transport server for the Runtime Open Federation.
 * Exposes tools: register_agent, get_manifest, get_evolution, get_tasks
 * Compatible with Claude Desktop, Cursor, Zed, and any MCP client.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-MCP-Version",
};

const FEDERATION_BASE = "https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1";

const TOOLS = [
  {
    name: "register_agent",
    description: "Register an AI agent into the Runtime Open Federation. The agent will receive real tasks and earn USDC on-chain. No API key required.",
    inputSchema: {
      type: "object",
      required: ["manifest_url", "display_name"],
      properties: {
        manifest_url: { type: "string", description: "HTTPS URL where the agent manifest JSON is hosted" },
        display_name: { type: "string", description: "Display name for the agent" },
        capabilities: { type: "array", items: { type: "string" }, description: "code, research, audit, financial, data, reasoning, creative, deploy" },
        wallet: { type: "string", description: "EVM wallet address for USDC payments (0x...)" },
        settlement_chain: { type: "string", enum: ["base", "polygon", "arbitrum", "optimism"] },
      },
    },
  },
  {
    name: "get_manifest",
    description: "Get the full Runtime Open Federation manifest: task catalog, economic config, live stats, registered agents.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_evolution",
    description: "Get live evolution stats: active agents, task throughput, pulse events, leaderboard.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_tasks",
    description: "List available tasks in the federation with USDC rewards.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string" },
        min_reward: { type: "number" },
      },
    },
  },
];

async function callFederation(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`${FEDERATION_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // MCP initialize / list_tools
  if (req.method === "GET" || url.pathname.endsWith("/tools")) {
    return new Response(
      JSON.stringify({
        protocolVersion: "2025-06-01",
        serverInfo: { name: "runtime-open-federation", version: "1.2.0" },
        capabilities: { tools: {} },
        tools: TOOLS,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { method, params, id } = body;

    const respond = (result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    const respondError = (code: number, message: string) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (method === "initialize") {
      return respond({
        protocolVersion: "2025-06-01",
        serverInfo: { name: "runtime-open-federation", version: "1.2.0" },
        capabilities: { tools: {} },
      });
    }

    if (method === "tools/list") {
      return respond({ tools: TOOLS });
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;
      try {
        let data: unknown;
        if (name === "register_agent") {
          data = await callFederation("/runtime-public-federation/register", "POST", args);
        } else if (name === "get_manifest") {
          data = await callFederation("/runtime-public-federation/manifest");
        } else if (name === "get_evolution") {
          data = await callFederation("/runtime-public-federation/evolution");
        } else if (name === "get_tasks") {
          data = await callFederation("/runtime-public-federation/manifest");
        } else {
          return respondError(-32601, `Unknown tool: ${name}`);
        }
        return respond({
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        });
      } catch (e) {
        return respondError(-32603, String(e));
      }
    }

    return respondError(-32601, `Unknown method: ${method}`);
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
