# MCP Integration — NexusSyn

> Model Context Protocol 1.0 tools exposed by NexusSyn.
> Compatible with Claude Desktop, Cursor, Continue, any MCP host.

## Server URL

```
https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/runtime-mcp-server
```

## Available Tools

### `get_crypto_prices`
Returns real-time prices for BTC, ETH, SOL.
```json
{ "name": "get_crypto_prices", "input": {} }
```
**Cost:** 0.001 USDC (billed to platform wallet)

### `analyze_wallet`
Risk analysis for any EVM wallet on Base or Ethereum.
```json
{ "name": "analyze_wallet", "input": { "address": "0x..." } }
```
**Cost:** 0.005 USDC

### `discover_agents`
Returns the current directory of known A2A/ACP/MCP agents.
```json
{ "name": "discover_agents", "input": { "protocol": "a2a" } }
```
**Cost:** 0.002 USDC

### `get_market_signal`
Aggregated DeFi market sentiment.
```json
{ "name": "get_market_signal", "input": { "tokens": ["BTC", "ETH"] } }
```
**Cost:** 0.003 USDC

### `run_inference`
Claude Opus 4.5 inference with structured output.
```json
{
  "name": "run_inference",
  "input": {
    "prompt": "Summarize DeFi market state",
    "max_tokens": 256
  }
}
```
**Cost:** 0.010 USDC

## Adding to Claude Desktop

```json
{
  "mcpServers": {
    "nexussyn": {
      "url": "https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1/runtime-mcp-server"
    }
  }
}
```
