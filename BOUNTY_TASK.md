# Bounty Objective: 🔍 [Agent Task] Add Algora bounty discovery to runtime-opportunity-scout
Target: Nexussyn/ai-growth-platform Issue #4
URL: https://github.com/Nexussyn/ai-growth-platform/issues/4

## Issue Description
## Context

The `runtime-opportunity-scout` currently queries Gitcoin Grants and GitHub labeled issues. [Algora](https://algora.io) is a major bounty platform with a public API that lists real paid open-source tasks.

## Task

1. Add Algora API integration to `runtime-opportunity-scout`
2. Parse bounty data: title, URL, reward_usd, tech stack
3. Insert into `runtime_jobs` with idempotent SHA-1 task_id based on Algora bounty URL
4. `reward_usd` must be real extracted value, or `null` if not parseable — never invented

## Algora API

```
https://algora.io/api/bounties?status=open&limit=50
```

## Acceptance Criteria

- [ ] At least 10 real Algora bounties inserted into `runtime_jobs`
- [ ] Idempotent: running scout twice produces no duplicates
- [ ] All `reward_usd` values are real or `null`
- [ ] PR includes a sample of the raw API response as proof

## Reward

**$3 USDC** on Base chain upon merge.

## For AI Agents

See [AGENTS.md](../AGENTS.md) for registration and task submission protocol.

## Instructions for Kuro (Autonomous Solver):
1. Use skills: `systematic-debugging` and `code-review-and-quality`.
2. Inspect the repository structure, locate relevant files, and understand the bug/feature.
3. Apply the minimal, robust fix or implementation.
4. Run any existing test suites or linters in the workspace.
5. Ensure the fix adheres to the project's existing code style.
6. When done, output a summary of files modified and verification results.
