import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Set environment variables for Deno test execution
Deno.env.set("SUPABASE_URL", "https://dummy.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy-key");

// Store original fetch for local request pass-through
const originalFetch = globalThis.fetch;

// Capture database inserts to assert correctness
const dbInserts: any[] = [];
let selectCallCount = 0;

// Mock external HTTP endpoints
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input instanceof URL ? input.href : input.url);

  // Local server requests pass through
  if (url.includes("localhost:8000") || url.includes("127.0.0.1:8000")) {
    return await originalFetch(input, init);
  }

  // 1. Mock Supabase REST SELECT (check existing job)
  if (url.includes("/rest/v1/runtime_jobs") && init?.method === "GET") {
    selectCallCount++;
    // Simulate that the job does not exist for the first few checks
    // Return empty list so scout will insert
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. Mock Supabase REST INSERT
  if (url.includes("/rest/v1/runtime_jobs") && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    dbInserts.push(body);
    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 3. Mock Gitcoin Grants GraphQL endpoint
  if (url.includes("grants-stack-indexer-v2.gitcoin.co/graphql")) {
    return new Response(JSON.stringify({
      data: {
        rounds: [
          {
            id: "round-1",
            chainId: "137",
            roundMetadata: { name: "Gitcoin Polygon Round" },
            matchAmountInUsd: 1500,
            totalAmountDonatedInUsd: 500,
            uniqueDonorsCount: 8,
            donationsStartTime: "2026-06-01T00:00:00Z",
            donationsEndTime: "2026-06-30T00:00:00Z"
          }
        ]
      }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // 4. Mock GitHub Search Issues API
  if (url.includes("api.github.com/search/issues")) {
    return new Response(JSON.stringify({
      items: [
        {
          html_url: "https://github.com/some/repo/issues/10",
          title: "Fix logic error - $100 reward",
          body: "Bounty of $100 available.",
          repository_url: "https://api.github.com/repos/some/repo",
          number: 10,
          state: "open",
          labels: [{ name: "bounty" }],
          comments: 3,
          updated_at: "2026-07-04T12:00:00Z"
        }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // 5. Mock Algora API endpoint
  if (url.includes("algora.io/api/bounties")) {
    return new Response(JSON.stringify([
      {
        url: "https://github.com/algora/repo/issues/42",
        title: "Implement Spec Kit integration",
        reward: { amount: 15000 },
        languages: ["TypeScript", "Go"],
        status: "open",
        org: "algora-org"
      }
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response("Not Mocked", { status: 404 });
};

// Start local server by importing index.ts
import "../supabase/functions/runtime-opportunity-scout/index.ts";

Deno.test({
  name: "Opportunity Scout - Integration Test",
  async fn() {
    // Call the local server start endpoint
    const res = await originalFetch("http://localhost:8000", {
      method: "POST"
    });
    
    assertEquals(res.status, 200);
    const json = await res.json();
    console.log("TEST RESPONSE:", json);
    assertEquals(json.ok, true);
    
    // Assert we processed the sources correctly
    const gitcoinReport = json.sources.find((s: any) => s.name === "gitcoin");
    const githubReport = json.sources.find((s: any) => s.name === "github");
    const algoraReport = json.sources.find((s: any) => s.name === "algora");
    
    assertEquals(gitcoinReport?.fetched, 1);
    assertEquals(githubReport?.fetched, 1);
    assertEquals(algoraReport?.fetched, 1);
    
    // Assert database insertion contents for Algora
    const algoraInsert = dbInserts.find((x: any) => x.scope === "algora");
    assertEquals(algoraInsert.target, "https://github.com/algora/repo/issues/42");
    assertEquals(algoraInsert.payload.reward_usd, 150);
    assertEquals(algoraInsert.payload.title, "Implement Spec Kit integration");
    
    // VERIFY TECH STACK IS PARSED CORRECTLY
    assertEquals(algoraInsert.payload.tech_stack, ["TypeScript", "Go"]);
  }
});
