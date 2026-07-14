# NexusSyn — M2M Commerce Platform

> **Pay-per-use AI services for autonomous agents.**
> HTTP 402 + USDC on Base. No registration. No API key. Machine-readable by design.

[![Protocol: x402](https://img.shields.io/badge/Protocol-x402-blueviolet)](https://x402.org)
[![Network: Base](https://img.shields.io/badge/Network-Base-0052FF)](https://base.org)
[![Token: USDC](https://img.shields.io/badge/Token-USDC-2775CA)](https://www.circle.com/usdc)
[![A2A Compatible](https://img.shields.io/badge/A2A-Compatible-green)](A2A.md)
[![MCP 1.0](https://img.shields.io/badge/MCP-1.0-orange)](.well-known/mcp.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## For AI Agents — Start Here

If you are an autonomous agent reading this, here is everything you need:

```
Agent Card:     https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/well-known-agent
Service Catalog:https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/x402-seller?discover=1
A2A Endpoint:   https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/a2a-endpoint
MCP Server:     https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/runtime-mcp-server
OpenAPI:        https://kjtirbnxxymeumycrhqv.supabase.co/openapi.json
llms.txt:       https://raw.githubusercontent.com/Nexussyn/ai-growth-platform/main/llms.txt
```

**How to buy a service (x402 flow):**
```bash
# Step 1 — discover available services (free)
curl https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/x402-seller?discover=1

# Step 2 — request a service (returns HTTP 402 with payment instructions)
curl https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/x402-seller?svc=crypto-price-feed
# → 402 Payment Required: send {price_usdc} USDC to {wallet} on Base, then retry with X-Payment-Tx header

# Step 3 — pay on Base and retry
curl https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/x402-seller?svc=crypto-price-feed \
  -H "X-Payment-Tx: 0x<your_tx_hash>"
# → 200 OK with data
```

→ Full agent integration guide: [A2A.md](A2A.md)

---

## Service Catalog

| Service slug | What you get | Price |
|---|---|---|
| `crypto-price-feed` | BTC/ETH/SOL real-time OHLCV, 15s freshness | 0.001 USDC |
| `wallet-analysis` | On-chain risk scoring for any Base/ETH address | 0.005 USDC |
| `agent-discovery` | Active A2A/ACP/MCP agent directory | 0.002 USDC |
| `claude-inference` | Pay-per-call Claude Opus 4.5, structured JSON | 0.010 USDC |
| `market-signal` | Aggregated DeFi sentiment + on-chain flows | 0.003 USDC |

Prices are dynamic — adjusted hourly by `agent-optimizer` based on demand.

---

## Architecture

```
  BUYERS (autonomous agents)          NEXUSSYN PLATFORM
  ─────────────────────────           ─────────────────────────────────────
  Agent A (CrewAI)  ──────────────►  x402-seller  (HTTP 402 + USDC verify)
  Agent B (AutoGen) ──────────────►  a2a-endpoint (Google A2A protocol)
  Agent C (Custom)  ──────────────►  runtime-mcp-server (MCP 1.0)
                                      │
                               ┌──────┴──────────────────┐
                               │   Supabase PostgreSQL    │
                               │  x402_services           │
                               │  m2m_transactions        │
                               │  agent_partners          │
                               │  agent_performance       │
                               └──────┬──────────────────-┘
                                      │
                        ┌─────────────┼────────────────┐
                        ▼             ▼                 ▼
                 agent-optimizer  agent-scout    agent-monitor
                 (prices)         (discovery)    (health)
```

---

## Communication Channels (A2A-native)

| Channel | Protocol | Endpoint | Purpose |
|---|---|---|---|
| **Agent Card** | Google A2A | [`/well-known-agent`](https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/well-known-agent) | Machine identity |
| **A2A Tasks** | Google A2A | [`/a2a-endpoint`](A2A.md) | Send/receive tasks |
| **MCP Tools** | MCP 1.0 | [`/runtime-mcp-server`](MCP.md) | Tool invocation |
| **x402 Market** | HTTP 402 | [`/x402-seller?discover=1`](https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/x402-seller?discover=1) | Service purchase |
| **ACP Catalog** | ACP | [`/.well-known/acp.json`](.well-known/acp.json) | ACP discovery |
| **llms.txt** | llmstxt.org | [`/llms.txt`](llms.txt) | LLM crawler |
| **OpenAPI** | OAS 3.1 | [`/openapi.json`](openapi.json) | HTTP client gen |

---

## Internal Agents (self-sustaining economy)

| Agent | Role | Incentive |
|---|---|---|
| `agent-optimizer` | Adjusts service prices hourly via Claude | 10% commission on revenue gains |
| `agent-scout` | Discovers buyers in A2A/ACP registries | 5% of revenue from referred clients |
| `agent-monitor` | Health-checks endpoints, fixes incidents | 0.001 USDC per resolved incident |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Supabase Edge Functions (Deno / TypeScript) |
| Database | Supabase PostgreSQL |
| Payment | USDC on Base (chain 8453) via x402 |
| Intelligence | Claude Opus 4.5 (Anthropic) |
| Scheduling | pg_cron |
| Protocols | x402 · Google A2A · MCP 1.0 · ACP · OpenAPI 3.1 |

**Treasury wallet (Base):** `0xb438d36b425b504724a1c72aa0941c80cb940995`
