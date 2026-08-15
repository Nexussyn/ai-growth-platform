# Security Considerations

This document outlines the security model of the platform backend and the
practices contributors must follow.

## Secrets handling

- **Never commit secrets.** Supabase service-role keys, provider API tokens,
  and webhook secrets belong in Supabase's secret manager only.
- **Least privilege.** The service-role key is server-side only. Client-facing
  code uses the anon key and never touches admin capabilities.
- **Rotation.** Rotate keys on any suspected exposure. Use `supabase secrets
  set` to overwrite, then revoke the old value.

## Input validation

All data ingested from upstream providers is untrusted. Treat every field as
potentially malformed:

- Validate and coerce types before persisting.
- Length-limit free-text fields to avoid unbounded storage.
- Reject or escape any value that will be rendered in a UI context.

## Output encoding

Any ingested value that is later rendered to users must be HTML-escaped at the
rendering layer to prevent stored cross-site scripting. Do not trust upstream
content to be safe.

## Network egress

- Only call allow-listed upstream hosts. A fetch to an arbitrary URL supplied
  by an upstream payload is forbidden.
- Enforce timeouts on every outbound request so a slow provider cannot exhaust
  the function's resources.
- Validate TLS: never disable certificate verification.

## Denial-of-service considerations

- The scout's schedule is rate-limited to avoid hammering upstream providers.
- Idempotent writes (`task_id` keyed upserts) prevent duplicate records when a
  run is retried.
- Functions should fail fast on upstream timeouts rather than retrying
  indefinitely.

## Logging

- Log only non-sensitive data. Never log full tokens, keys, or PII.
- Include correlation IDs so a single run can be traced across logs.

## Reporting

If you discover a vulnerability, report it privately to the maintainers rather
than opening a public issue with exploit details.
