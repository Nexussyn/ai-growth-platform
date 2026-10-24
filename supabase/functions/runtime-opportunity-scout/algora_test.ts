import { deepStrictEqual, equal, rejects, throws } from "node:assert/strict";
import { ALGORA_API_URL, fetchAlgora, parseAlgoraBounties } from "./algora.ts";
import liveResponse from "./fixtures/algora-live-2026-10-12.json" with {
  type: "json",
};

import { envelope, syntheticBounty } from "./fixtures/synthetic.ts";

Deno.test("official envelope extracts canonical Algora URL, title, USD cents and technology", () => {
  const [opportunity] = parseAlgoraBounties(envelope([syntheticBounty()]));
  equal(opportunity.url, "https://algora.io/fixture/bounties/1");
  equal(opportunity.title, "Synthetic test bounty 1");
  equal(opportunity.reward_usd, 125);
  deepStrictEqual(opportunity.tech_stack, ["TypeScript", "Deno", "PostgreSQL"]);
  equal(opportunity.raw.id, 1);
});

Deno.test("currency and malformed amounts never become invented USD rewards", () => {
  for (
    const [currency, amount] of [
      ["EUR", 12500],
      ["JPY", 12500],
      ["USDC", 12500],
      [undefined, 12500],
      ["USD", ""],
      ["USD", true],
      ["USD", -1],
      ["USD", "0x100"],
      ["USD", "NaN"],
      ["USD", 12.5],
      ["USD", Number.POSITIVE_INFINITY],
      ["USD", Number.MAX_SAFE_INTEGER + 1],
    ]
  ) {
    const item = { ...syntheticBounty(), reward: { currency, amount } };
    equal(parseAlgoraBounties([item])[0].reward_usd, null);
  }
  const item = {
    ...syntheticBounty(),
    reward: { currency: "USD", amount: "12500" },
  };
  equal(parseAlgoraBounties([item])[0].reward_usd, 125);
});

Deno.test("legacy explicit amount_usd remains in major units; missing reward is null", () => {
  const item = {
    title: "Synthetic legacy",
    url: "https://example.com/bounty/1",
    amount_usd: 50,
  };
  equal(parseAlgoraBounties({ items: [item] })[0].reward_usd, 50);
  equal(
    parseAlgoraBounties({ bounties: [{ ...item, amount_usd: undefined }] })[0]
      .reward_usd,
    null,
  );
});

Deno.test("closed, points-only, invalid and duplicated entries are excluded", () => {
  const first = syntheticBounty();
  const invalid = [
    null,
    42,
    { ...first, status: "paid" },
    { ...first, reward_type: "points" },
    { ...first, task: { ...first.task, status: "closed" } },
    { ...first, org: null, url: "javascript:alert(1)" },
    {
      ...first,
      org: null,
      url: "https://user:pass@example.com/",
    },
    { ...first, task: { ...first.task, title: " " } },
  ];
  equal(parseAlgoraBounties(envelope([...invalid, first, first])).length, 1);
});

Deno.test("distinct bounties on one issue retain distinct URLs; invalid identifiers are rejected", () => {
  const first = syntheticBounty();
  equal(parseAlgoraBounties(envelope([first, { ...first, id: 2 }])).length, 2);
  for (
    const id of [
      null,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
      "../other",
      "1?private=true",
    ]
  ) {
    equal(parseAlgoraBounties([{ ...first, id }]).length, 0);
  }
});

Deno.test("unexpected shape and tRPC errors are reported rather than silently empty", () => {
  for (
    const response of [null, {}, { items: {} }, [{
      error: { message: "failed" },
      result: null,
    }]]
  ) {
    throws(() => parseAlgoraBounties(response), /Unexpected Algora/);
  }
});

Deno.test("fetch uses public endpoint and surfaces HTTP/JSON failures", async () => {
  const results = await fetchAlgora((url, init) => {
    equal(url, ALGORA_API_URL);
    deepStrictEqual(init?.headers, { Accept: "application/json" });
    return Promise.resolve(Response.json(envelope([syntheticBounty()])));
  });
  equal(results.length, 1);
  await rejects(
    () =>
      fetchAlgora(() =>
        Promise.resolve(new Response("unavailable", { status: 406 }))
      ),
    /HTTP 406/,
  );
  await rejects(() =>
    fetchAlgora(() => Promise.resolve(new Response("not JSON")))
  );
});

Deno.test("captured real public response is empty; it is not ten fabricated opportunities", () => {
  equal(parseAlgoraBounties(liveResponse).length, 0);
});
