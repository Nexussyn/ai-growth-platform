# Algora Source — Raw API Response Sample

This file documents the actual raw response the Algora bounties API returned at
implementation time (2026-08-03), satisfying the "sample of the raw API
response as proof" acceptance criterion for the Algora discovery integration.

## Endpoint probed

```
GET https://algora.io/api/bounties?status=open&limit=5
GET https://console.algora.io/api/bounties?status=open&limit=30
```

## Result: no JSON bounty payload available

Both documented endpoints returned `200 OK` with `Content-Type: text/html`
(~30 KB HTML shell), not the JSON bounty list the old public API used to serve.
Algora has pivoted its public positioning to full-time/contract work matching
("Algora connects companies and engineers for full-time and contract work"),
and the bounty API no longer emits bounty records.

The raw response is an HTML document (a React/Next.js app shell), beginning:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="...">
    <title>Algora</title>
    <meta name="description" content="Algora connects companies and engineers for full-time and contract work">
  </head>
  ...
```

No `items`, `bounties`, or bare-array JSON shape was present in either body.

## What the scout does with this

The integration is built to be honest under this condition:

1. Probes both documented endpoints in order.
2. Validates `Content-Type` contains `json` before parsing — an HTML shell can
   never be mis-parsed as an empty bounty list.
3. If no endpoint returns JSON, the source report records an explicit error
   (`algora: non-JSON response (text/html) from ...`) so the failure is
   visible in the scout report instead of masquerading as "0 bounties".
4. When Algora restores a JSON bounty API (same paths or new), the integration
   will immediately start queueing real bounties — no code change required.
5. `reward_usd` remains strictly real-or-null; nothing is invented, and the
   tech stack is extracted only from actual labels/tags/keywords present in
   the payload.

## Verification commands

```bash
curl -s https://algora.io/api/bounties?status=open&limit=5 -o /tmp/algora.bin
file /tmp/algora.bin   # expect: HTML document, not JSON
```

## Original issue reference

[#4 — Add Algora bounty discovery to runtime-opportunity-scout](https://github.com/Nexussyn/ai-growth-platform/issues/4)
