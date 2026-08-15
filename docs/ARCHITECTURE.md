# Architecture Overview

This document describes the high-level structure of the AI growth platform and
how its moving pieces fit together.

## Components

### Supabase backend

The backend runs on Supabase and exposes:

- **Edge Functions** under `supabase/functions/` — short-lived TypeScript
  handlers invoked over HTTP. Each function is deployed independently and is
  the primary home for integration logic.
- **Database schema** managed through Supabase migrations. Tables model the
  platform's core entities (opportunities, tasks, and their lifecycle state).

### `runtime-opportunity-scout`

The scout is the component responsible for discovering paid work opportunities
from external sources. Its responsibilities are:

1. **Ingest** — fetch opportunity listings from upstream providers (for example
   the Algora JSON endpoints).
2. **Normalize** — map each upstream listing into a canonical internal shape
   with a stable identifier.
3. **Deduplicate** — keep the feed idempotent by deriving a stable `task_id`
   from the source URL (SHA-1 of the canonical URL is used today).
4. **Publish** — write normalized records into the database so downstream
   consumers can surface them to users.

### Data flow

```
upstream provider (JSON / HTML)
        |
        v
runtime-opportunity-scout (ingest + normalize + dedupe)
        |
        v
Supabase table (canonical opportunities)
        |
        v
presentation layer (web / notifications)
```

## Design principles

- **Idempotency first.** Every ingest run can be safely replayed; the stable
  `task_id` ensures a given opportunity is never duplicated.
- **Never invent data.** Fields that cannot be parsed (for example a monetary
  reward that is not machine-readable) are left unset rather than guessed.
- **Graceful degradation.** If a primary upstream endpoint returns an HTML
  shell instead of JSON, the scout falls back to a secondary discovery path
  rather than failing the whole run.

## Extending the scout

To add a new opportunity source:

1. Add a fetch function for the new endpoint under the scout's `sources/`
   directory.
2. Map the upstream payload into the canonical record shape.
3. Preserve the stable `task_id` derivation from the source URL.
4. Add a raw sample fixture under `fixtures/` so the mapping can be verified
   without live network access.

## Observability

Each ingest run should emit structured logs capturing:

- The number of opportunities seen and newly discovered.
- Any upstream errors, with the provider and endpoint that failed.
- The fallback path taken when a primary endpoint returns an HTML shell.

These signals let operators distinguish a healthy discovery run from one that
is silently returning zero results.
