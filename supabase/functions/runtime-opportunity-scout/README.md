# Algora discovery verification (issue #4)

The existing scout used a redirecting `/api/bounties` URL, read title/URL at the
wrong level for Algora's current response, and treated every reward as USD.
The Algora adapter now uses the public `/api/trpc/bounty.list` route and parses
`result.data.json.items`, including `task.title`, bounty identifiers and technology.
Legacy arrays and `items`/`bounties` envelopes remain supported.

Only explicitly USD rewards are converted from cents to dollars. Missing,
invalid or non-USD amounts remain `null`; no exchange rate or reward is invented.
The source record is retained in `payload.raw`, with normalized technology in
`payload.tech_stack`. Closed tasks and points-only rewards are excluded.

Canonical Algora URLs use the official `/:org_handle/bounties/:id` route with
identifiers supplied by Algora. The linked task URL stays in `payload.raw.task.url`.
Separate bounties on one GitHub issue retain separate identities.
The existing URL-derived SHA-1 key format (`opp-algora-` plus 24 hex characters)
is preserved. The `runtime_jobs.task_id` UNIQUE constraint handles concurrent
insert races; database read/other write errors are reported rather than ignored.
Gitcoin and GitHub discovery remain wired into the same scout.

## Checks

From this directory, with Deno installed:

```sh
deno task test
deno task check
deno task lint
deno fmt --check algora.ts queue.ts algora_test.ts queue_test.ts fixtures/synthetic.ts deno.json
```

Verified on Windows with Deno 2.9.6: **11 tests passed**, entry-point type check,
module lint and formatting passed. Tests require no Supabase credentials or
production connection. The PostgreSQL integration test uses PGlite 0.5.8 and
the same queue function called by the edge handler: 10 **synthetic** contract
records insert on the first run, zero new records on the second, and concurrent
inserts of one URL produce exactly one row. Currency, malformed responses,
invalid URLs, closed/points records and database errors are also tested.

## Live acceptance limitation

The verbatim public response is in `fixtures/algora-live-2026-10-12.json`, with
URL, UTC retrieval time, HTTP status and SHA-256 in its provenance file.
At **2026-10-12 20:47:42 UTC**, the public endpoint returned HTTP 200 and:

```json
[{"result":{"data":{"json":{"items":[],"next_cursor":null}}}}]
```

The issue's old `https://algora.io/api/bounties?status=open&limit=50` endpoint
returned HTTP 406 during verification. Algora's current controller itself
renders an empty list. Consequently **10 real bounty inserts have not been
demonstrated**. The synthetic database test does not satisfy that live criterion.
A populated authorized public endpoint/response is needed to finish it. No
production deployment, production database write, bounty claim, wallet setup,
payment or acceptance is represented by this contribution.

## Official schema evidence

- [Response envelope, USD currency/minor-unit amount, task URL/title and tech](https://github.com/algora-io/algora/blob/74a49d7728400152f5d640ac8d461e6664b7c2eb/lib/algora_web/controllers/api/bounty_json.ex)
- [Controller returning an empty list](https://github.com/algora-io/algora/blob/74a49d7728400152f5d640ac8d461e6664b7c2eb/lib/algora_web/controllers/api/bounty_controller.ex)
- [Canonical public bounty URL route](https://github.com/algora-io/algora/blob/74a49d7728400152f5d640ac8d461e6664b7c2eb/lib/algora_web/router.ex#L171)

`fixtures/synthetic.ts` is explicitly synthetic test data, not proof of real
opportunities or funding.
