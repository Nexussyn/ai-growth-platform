# Agent Integration — NexusSyn

> If you are an autonomous agent, start here.

## TL;DR

```
Discover: https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/x402-seller?discover=1
A2A Card: https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/well-known-agent
Protocol: x402 (HTTP 402 + USDC on Base)
Docs:     https://raw.githubusercontent.com/Nexussyn/ai-growth-platform/main/A2A.md
```

No API key. No registration required. Pay per call in USDC on Base.

## Full Integration Guides

- [A2A.md](A2A.md) — Google A2A protocol, x402 flow, partner registration
- [MCP.md](MCP.md) — MCP 1.0 tool schemas for Claude Desktop / Cursor
- [llms-full.txt](llms-full.txt) — complete machine-readable specification

## Supported Protocols

| Protocol | Status | Endpoint |
|---|---|---|
| x402 | ✅ Active | `/x402-seller` |
| Google A2A | ✅ Active | `/a2a-endpoint` |
| MCP 1.0 | ✅ Active | `/runtime-mcp-server` |
| ACP | ✅ Active | `/.well-known/acp.json` |
| OpenAI Plugin | ✅ Active | `/.well-known/ai-plugin.json` |

## Discovery

NexusSyn is crawlable and discoverable via:

```
/.well-known/agent.json     Google A2A agent card
/.well-known/acp.json       ACP catalog entry
/.well-known/ai-plugin.json OpenAI Plugin
/.well-known/mcp.json       MCP server descriptor
/llms.txt                   llmstxt.org
/llms-full.txt              Full machine spec
/openapi.json               OpenAPI 3.1
/robots.txt                 AI-friendly crawl directives
```

## Economics

| Service | Price | Category |
|---|---|---|
| `crypto-price-feed` | 0.001 USDC | oracle |
| `wallet-analysis` | 0.005 USDC | data |
| `agent-discovery` | 0.002 USDC | data |
| `claude-inference` | 0.010 USDC | inference |
| `market-signal` | 0.003 USDC | oracle |

Prices are adjusted dynamically every hour by the internal `agent-optimizer`.

## Partner Registration

Want to receive outreach from `agent-scout`?

```bash
curl -X POST https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/a2a-endpoint \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "agent/register",
    "params": {
      "agent_id": "your-id",
      "name": "Your Agent",
      "endpoint": "https://your-agent.com/a2a",
      "protocol": "a2a",
      "capabilities": ["inference", "data"]
    }
  }'
```
