# Algora Opportunity Scout Proof

Issue: https://github.com/Nexussyn/ai-growth-platform/issues/4

## Endpoint probes

The scout now probes the requested Algora endpoint first:

```bash
curl -L -H 'Accept: application/json' \
  'https://algora.io/api/bounties?status=open&limit=50'
```

Current observed response on 2026-07-11:

```json
{"errors":{"detail":"Not Acceptable"}}
```

The same JSON request shape currently returns `406 Not Acceptable` from the
console host as well:

```bash
curl -L -H 'Accept: application/json' \
  'https://console.algora.io/api/bounties?status=open&limit=50'
```

Observed body:

```json
{"errors":{"detail":"Not Acceptable"}}
```

## Runtime behavior

- The official issue endpoint is still tried first.
- Non-JSON or non-2xx responses are skipped instead of inventing bounty rows.
- The console endpoint is retained as a fallback for deployments where it serves
  JSON.
- Supported JSON response shapes include bare arrays, `items`, `bounties`, and
  `data`.
- `tech_stack` is normalized from common fields such as `tech_stack`,
  `technologies`, `languages`, `labels`, `tags`, and `stack`.
- Bounties are deduplicated by URL before insertion; `task_id` remains the
  SHA-1-derived idempotency key based on the Algora bounty URL.

## Sample accepted JSON shape

The parser accepts this real-field minimal shape without fabricating rewards:

```json
{
  "items": [
    {
      "title": "Fix mobile upload flow",
      "url": "https://github.com/example/project/issues/123",
      "amount_usd": 75,
      "languages": ["TypeScript", "React"],
      "status": "open",
      "organization": "example"
    }
  ]
}
```

This becomes a `runtime_jobs` payload with:

```json
{
  "source": "algora",
  "url": "https://github.com/example/project/issues/123",
  "title": "Fix mobile upload flow",
  "reward_usd": 75,
  "tech_stack": ["TypeScript", "React"]
}
```
