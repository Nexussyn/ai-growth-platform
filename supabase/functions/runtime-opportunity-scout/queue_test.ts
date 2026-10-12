import { deepStrictEqual, equal, rejects } from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { envelope, syntheticBounty } from "./fixtures/synthetic.ts";
import { parseAlgoraBounties } from "./algora.ts";
import {
  type JobRow,
  type QueueClient,
  queueOpportunity,
  stableTaskId,
} from "./queue.ts";

// Real local PostgreSQL, exposed through only the Supabase operations used here.
// Relevant runtime_jobs columns/defaults match the repository's migrations.
function localClient(db: PGlite): QueueClient {
  return {
    from() {
      return {
        select() {
          return {
            eq(_column, value) {
              return {
                async maybeSingle() {
                  const result = await db.query<{ task_id: string }>(
                    "SELECT task_id FROM runtime_jobs WHERE task_id = $1",
                    [value],
                  );
                  return { data: result.rows[0] ?? null, error: null };
                },
              };
            },
          };
        },
        async insert(row: JobRow) {
          try {
            const keys = Object.keys(row);
            await db.query(
              `INSERT INTO runtime_jobs (${keys.join(",")}) VALUES (${
                keys.map((_, i) => `$${i + 1}`).join(",")
              })`,
              Object.values(row).map((value) =>
                typeof value === "object" ? JSON.stringify(value) : value
              ),
            );
            return { error: null };
          } catch (error) {
            const e = error as { code?: string; message: string };
            return { error: { code: e.code, message: e.message } };
          }
        },
      };
    },
  };
}

Deno.test("ten synthetic contract rows insert once in PostgreSQL and survive a second run", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE runtime_jobs (
      task_id text UNIQUE NOT NULL, agent_role text NOT NULL,
      target text NOT NULL DEFAULT '', scope text NOT NULL DEFAULT '',
      success_metric text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'queued',
      task_kind text NOT NULL DEFAULT 'discovery', priority int NOT NULL DEFAULT 0,
      source_class text NOT NULL DEFAULT 'internal', payload jsonb NOT NULL DEFAULT '{}'
    )`);
    const client = localClient(db);
    const items = Array.from({ length: 10 }, (_, i) => syntheticBounty(i + 1));
    const opportunities = parseAlgoraBounties(envelope(items));
    const first = [];
    const second = [];
    for (const opportunity of opportunities) {
      first.push(await queueOpportunity(client, "opp-algora", opportunity));
    }
    for (const opportunity of opportunities) {
      second.push(await queueOpportunity(client, "opp-algora", opportunity));
    }
    deepStrictEqual(first, Array(10).fill("inserted"));
    deepStrictEqual(second, Array(10).fill("skipped"));
    const rows = await db.query<
      { payload: { reward_usd: number; tech_stack: string[] } }
    >("SELECT payload FROM runtime_jobs");
    equal(rows.rows.length, 10);
    equal(rows.rows[0].payload.reward_usd, 125);
    deepStrictEqual(rows.rows[0].payload.tech_stack, [
      "TypeScript",
      "Deno",
      "PostgreSQL",
    ]);

    const concurrent = parseAlgoraBounties([syntheticBounty(11)])[0];
    const raced = await Promise.all([
      queueOpportunity(client, "opp-algora", concurrent),
      queueOpportunity(client, "opp-algora", concurrent),
    ]);
    deepStrictEqual(raced.sort(), ["inserted", "skipped"]);
    equal(
      (await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM runtime_jobs",
      )).rows[0].count,
      11,
    );
  } finally {
    await db.close();
  }
});

Deno.test("SHA-1 IDs retain the existing format and are stable for the source URL", async () => {
  equal(
    await stableTaskId("opp-algora", "https://example.com"),
    "opp-algora-327c3fda87ce286848a57498",
  );
  equal(
    await stableTaskId("opp-algora", "https://example.com"),
    await stableTaskId("opp-algora", "https://example.com"),
  );
});

Deno.test("database read errors fail without attempting an insert", async () => {
  let inserts = 0;
  const client: QueueClient = {
    from() {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: null,
                error: { message: "lookup failed" },
              }),
          }),
        }),
        insert: () => {
          inserts++;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  await rejects(
    () =>
      queueOpportunity(
        client,
        "opp-algora",
        parseAlgoraBounties([syntheticBounty()])[0],
      ),
    /lookup failed/,
  );
  equal(inserts, 0);
});
