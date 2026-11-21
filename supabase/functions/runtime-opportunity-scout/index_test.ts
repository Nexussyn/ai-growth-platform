import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractTechStack,
  extractUsd,
  parseAlgoraHtmlFallback,
  parseAlgoraJsonItems,
  stableTaskId,
} from "./index.ts";

Deno.test("extractUsd parses real USD numbers and returns null when absent", () => {
  assertEquals(extractUsd("Bounty: $1,250 for Rust connector"), 1250);
  assertEquals(extractUsd("Reward 2.5k$ USDC"), 2500);
  assertEquals(extractUsd("No reward mentioned in this issue"), null);
});

Deno.test("parseAlgoraJsonItems extracts title, url, real reward_usd or null, and tech_stack", () => {
  const sample = {
    items: [
      {
        title: "Build TypeScript & Supabase edge worker",
        url: "https://github.com/Nexussyn/ai-growth-platform/issues/4",
        reward: { amount: 25000 },
        tech_stack: ["TypeScript", "Supabase"],
        org: "Nexussyn",
        status: "open",
      },
      {
        title: "Open issue with unquantified bounty",
        url: "https://github.com/example/repo/issues/99",
        org: "example",
        status: "open",
      },
    ],
  };

  const parsed = parseAlgoraJsonItems(sample);
  assertEquals(parsed.length, 2);
  assertEquals(parsed[0].source, "algora");
  assertEquals(parsed[0].reward_usd, 250);
  assertEquals(parsed[0].tech_stack?.includes("typescript"), true);
  assertEquals(parsed[0].tech_stack?.includes("supabase"), true);
  // Never invents a reward when absent
  assertEquals(parsed[1].reward_usd, null);
});

Deno.test("parseAlgoraHtmlFallback extracts GitHub issue bounties from HTML when API requires key", () => {
  const html = `
    <div>
      <span>$500 bounty for Rust & Python SDK</span>
      <a href="https://github.com/acme/sdk/issues/42">acme/sdk#42</a>
    </div>
  `;
  const opps = parseAlgoraHtmlFallback(html);
  assertEquals(opps.length, 1);
  assertEquals(opps[0].url, "https://github.com/acme/sdk/issues/42");
  assertEquals(opps[0].reward_usd, 500);
  assertEquals(opps[0].tech_stack?.includes("rust"), true);
});

Deno.test("stableTaskId produces deterministic SHA-1 idempotency key", async () => {
  const id1 = await stableTaskId("opp-algora", "https://github.com/Nexussyn/ai-growth-platform/issues/4");
  const id2 = await stableTaskId("opp-algora", "https://github.com/Nexussyn/ai-growth-platform/issues/4");
  assertEquals(id1, id2);
});
