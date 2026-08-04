# Algora discovery

Issue: https://github.com/Nexussyn/ai-growth-platform/issues/4

## Behavior
1. Tries `https://algora.io/api/bounties?status=open&limit=50` and console variant.
2. If those return HTML/non-JSON (current production behavior), falls back to GitHub Search for open issues referencing Algora bounty rails.
3. `reward_usd` only from parseable amounts; otherwise `null`.
4. Idempotent `task_id` = SHA-1 of bounty URL (`opp-algora-...`).

## Proof sample
See `fixtures/algora_discovery_sample.json` (raw GitHub Search payload used by the fallback path).
