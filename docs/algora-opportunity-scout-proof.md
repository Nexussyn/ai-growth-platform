# Algora Opportunity Scout Proof

Checked on 2026-07-10 UTC for issue #4.

## Documented API Probe

Request:

```text
GET https://algora.io/api/bounties?status=open&limit=50
Accept: application/json
```

Observed public response shape from the current endpoint was the interactive Algora HTML shell rather than JSON:

```text
Bounties
Create new bounties by commenting /bounty $1000 on GitHub issues.
No open bounties
Create bounties by commenting /bounty $1000 on GitHub issues
```

The scout still calls this API first and will parse JSON if Algora returns `application/json`.

## Public Fallback Samples

When the API returns HTML, the scout reads public Algora bounty pages and extracts only visible real dollar amounts:

```text
https://algora.io/SCIBASE.AI/bounties?status=open
$400 SCIBASE.AI#13 AI-Assisted Research Tools (MVP Level)

https://algora.io/unsiloed-ai/bounties?status=open
$1,000 Unsiloed-chunker#34 Create an agentic RAG retrieval system

https://algora.io/archestra-ai/bounties?status=open
$100 archestra#3859 json in mcp server args textarea

https://algora.io/arakoodev/bounties?status=open
$50 EdgeChains#290 BOUNTY: integrate AWS Comprehend as a utility to redact data
```

Rewards are inserted as extracted numeric USD values, or `null` when no value can be parsed.
