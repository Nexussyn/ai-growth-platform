// Deliberately synthetic contract data, never presented as live paid bounties.
export function syntheticBounty(number = 1) {
  return {
    id: number,
    reward: { amount: 12500, currency: "USD" },
    reward_type: "cash",
    tech: ["TypeScript", "Deno"],
    status: "open",
    org: { handle: "fixture", tech: ["TypeScript"] },
    task: {
      title: `Synthetic test bounty ${number}`,
      url: `https://github.com/example/fixture/issues/${number}`,
      status: "open",
      tech: ["PostgreSQL"],
    },
  };
}

export function envelope(items: unknown[]) {
  return [{ result: { data: { json: { items, next_cursor: null } } } }];
}
