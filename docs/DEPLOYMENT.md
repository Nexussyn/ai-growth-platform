# Deployment Guide

This guide documents how to deploy and operate the AI growth platform's
Supabase backend.

## Prerequisites

- A Supabase project (or a self-hosted Supabase instance).
- The Supabase CLI (`supabase`) installed and authenticated.
- Node.js 20+ for building and testing edge functions.
- Access to the project's environment variables (see `.env.example`).

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Project URL | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side API key (never expose in client code) | yes |
| `UPSTREAM_FEED_URL` | Primary opportunity feed endpoint | yes |
| `UPSTREAM_FEED_FALLBACK` | Secondary discovery endpoint | no |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | no |

Secrets must be stored in Supabase's secret manager, never committed to the
repository.

## Deploying edge functions

```bash
# Link to the project
supabase link --project-ref <project-ref>

# Deploy a single function
supabase functions deploy runtime-opportunity-scout

# Deploy all functions
supabase functions deploy
```

After deploying, verify the function responds:

```bash
curl -s https://<project-ref>.supabase.co/functions/v1/runtime-opportunity-scout
```

## Configuration management

Function configuration is set through Supabase secrets:

```bash
supabase secrets set UPSTREAM_FEED_URL=https://api.example.com/feed
supabase secrets set UPSTREAM_FEED_FALLBACK=https://api.example.com/fallback
```

Rotate secrets with `supabase secrets set` (which overwrites) rather than
editing files in place.

## Scheduled ingestion

Opportunity discovery is intended to run on a schedule. Configure the schedule
through Supabase's cron extension or an external scheduler that invokes the
function on an interval. Keep the interval conservative (no more than once per
hour) to stay within upstream rate limits.

## Rollback

Edge functions are versioned. To roll back:

```bash
supabase functions deploy runtime-opportunity-scout --use-verification=false
```

Or re-deploy the previous bundle from CI history. Keep deployment artifacts
(e.g. CI run IDs) in the runbook so a bad release can be reverted quickly.

## Monitoring checklist

- Watch function invocation count and error rate in the Supabase dashboard.
- Alert on zero discovered opportunities over a full day, which usually means
  an upstream endpoint changed format.
- Review structured logs for fallback-path hits; repeated fallbacks indicate
  the primary endpoint is unhealthy.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Zero opportunities | Upstream changed format | Check logs, update ingest mapping |
| HTML shell returned | Endpoint now serves JS app | Verify fallback path is configured |
| High error rate | Rate limited upstream | Lower schedule frequency |
| `task_id` collisions | URL normalization changed | Revert URL canonicalization |
