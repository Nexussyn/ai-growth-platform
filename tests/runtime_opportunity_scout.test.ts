// Tests for runtime-opportunity-scout Algora discovery (Deno test runner)
import {
  parseAlgoraItems,
  parseAlgoraReward,
  parseAlgoraTechStack,
  stableTaskId,
  extractUsd,
  Opportunity,
} from "../supabase/functions/runtime-opportunity-scout/index.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(expr: unknown, msg?: string) {
  if (!expr) throw new Error(msg || "Assertion failed");
}

Deno.test("parseAlgoraItems handles various JSON envelope shapes", () => {
  assertEquals(parseAlgoraItems([{ id: "1" }]), [{ id: "1" }]);
  assertEquals(parseAlgoraItems({ items: [{ id: "2" }] }), [{ id: "2" }]);
  assertEquals(parseAlgoraItems({ bounties: [{ id: "3" }] }), [{ id: "3" }]);
  assertEquals(parseAlgoraItems(null), []);
  assertEquals(parseAlgoraItems({}), []);
});

Deno.test("parseAlgoraReward extracts exact numbers or null — never invents values", () => {
  assertEquals(parseAlgoraReward({ reward: { amount: 5000 } }, "Task"), 50);
  assertEquals(parseAlgoraReward({ amount_usd: 120 }, "Task"), 120);
  assertEquals(parseAlgoraReward({ reward_usd: 350 }, "Task"), 350);
  assertEquals(parseAlgoraReward({}, "Add feature [$500]"), 500);
  assertEquals(parseAlgoraReward({}, "Bounty $1.5k"), 1500);
  assertEquals(parseAlgoraReward({}, "Fix bug (100 USD)"), 100);
  assertEquals(parseAlgoraReward({}, "General maintenance task"), null);
});

Deno.test("parseAlgoraTechStack parses tags and skills correctly", () => {
  assertEquals(
    parseAlgoraTechStack({ tech_stack: ["TypeScript", "Supabase"] }),
    ["TypeScript", "Supabase"]
  );
  assertEquals(
    parseAlgoraTechStack({ tags: ["rust", "wasm"] }),
    ["rust", "wasm"]
  );
  assertEquals(
    parseAlgoraTechStack({ labels: [{ name: "frontend" }, { name: "react" }] }),
    ["frontend", "react"]
  );
  assertEquals(parseAlgoraTechStack({}), []);
});

Deno.test("stableTaskId is deterministic SHA-1 based on URL", async () => {
  const url1 = "https://github.com/activepieces/activepieces/issues/9754";
  const url2 = "https://github.com/activepieces/activepieces/issues/9754";
  const url3 = "https://github.com/microg/GmsCore/issues/2843";

  const id1 = await stableTaskId("opp-algora", url1);
  const id2 = await stableTaskId("opp-algora", url2);
  const id3 = await stableTaskId("opp-algora", url3);

  assertEquals(id1, id2, "Identical URLs must yield identical task IDs");
  assert(id1 !== id3, "Distinct URLs must yield distinct task IDs");
  assert(/^opp-algora-[a-f0-9]{24}$/.test(id1), "Task ID must match expected format");
});
