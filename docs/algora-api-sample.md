# Algora API probe sample (issue #4 proof)

Captured by `brok-best` / runtime-opportunity-scout improvements on 2026-07-29.

## Request

```http
GET https://algora.io/api/bounties?status=open&limit=50
Accept: application/json
User-Agent: runtime-opportunity-scout/1.0 (+open-source-federation)
```

## Observed response (live)

```http
HTTP/1.1 406 Not Acceptable
```

```json
{"errors":{"detail":"Not Acceptable"}}
```

Same 406 from:

- `https://console.algora.io/api/bounties?status=open&limit=50`
- `https://algora.io/api/v1/bounties?status=open&limit=50`

## Site status

`https://algora.io` marketing site loads (recruiting positioning).  
`https://algora.io/bounties` returns **404 Page Not Found** (public bounty board removed/moved).

## Scout behavior after this PR

1. Try multiple Algora JSON endpoints.
2. Record live status/body previews in-memory for observability.
3. If API returns no items, fall back to **GitHub Search** for open issues that reference `algora.io` URLs / extractable USD amounts (never invent rewards).
4. Idempotent `task_id` remains SHA-1 of opportunity URL.

## Local reproduction

```bash
curl -sS -D- -H 'Accept: application/json' \
  'https://algora.io/api/bounties?status=open&limit=5' | head
```
