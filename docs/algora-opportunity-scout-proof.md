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

Second proof check on 2026-07-12 UTC: the public `SCIBASE.AI` Algora page alone exposed 11 open bounties, enough for the "at least 10 real Algora bounties" acceptance path if the API keeps serving HTML. The first 10 parser-visible rows were:

```text
https://algora.io/SCIBASE.AI/bounties?status=open
$400 SCIBASE.AI#13 AI-Assisted Research Tools (MVP Level)
$500 SCIBASE.AI#20 Revenue Infrastructure
$175 SCIBASE.AI#19 Enterprise Tooling
$1,000 SCIBASE.AI#18 Scientific Bounty System
$475 SCIBASE.AI#17 Scientific Knowledge Graph Integration
$1,325 SCIBASE.AI#16 AI-Powered Research Assistant Suite
$525 SCIBASE.AI#15 Community & User Reputation System
$375 SCIBASE.AI#14 Scientific/Engineering Data & Code Hosting
$700 SCIBASE.AI#12 Real-time collaborative research editor & interface
$500 SCIBASE.AI#11 User & Project Management
```

Rewards are inserted as extracted numeric USD values, or `null` when no value can be parsed.

Freshness note added on 2026-07-13 UTC: Algora opportunities now carry `observed_at` in the queued payload and raw source metadata. This keeps the existing URL-based idempotency key while making stale or inconsistent source-page repeats auditable in `runtime_jobs`.
