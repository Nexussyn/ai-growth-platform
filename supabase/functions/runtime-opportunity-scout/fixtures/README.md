# Algora API discontinuation evidence (captured 2026-10-05)

`algora-dead-response.sample.html` is the first 1500 bytes of the live response from `GET https://algora.io/api/bounties?status=open&limit=50` (HTTP 200, `content-type: text/html; charset=utf-8`).

It is the recruiting-app HTML shell (Phoenix app: `csrf-token` meta tag, viewport headers) — not bounty JSON. The legacy endpoint `https://console.algora.io/api/bounties` 301-redirects to the same URL.

Conclusion: Algora has pivoted to a recruiting product; the public bounty API documented in issue #4 no longer exists. The scout's Algora adapter now detects this explicitly (content-type check across both known endpoints) and reports `status: "discontinued"` instead of silently returning zero results. If Algora ever restores the JSON API, parsing resumes automatically — no further change needed.
