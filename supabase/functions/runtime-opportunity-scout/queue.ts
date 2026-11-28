export type Opportunity = {
  source: string;
  title: string;
  url: string;
  reward_usd: number | null;
  tech_stack?: string[];
  raw: Record<string, unknown>;
};

type QueueError = { code?: string; message: string };
export type JobRow = {
  task_id: string;
  agent_role: string;
  status: string;
  task_kind: string;
  priority: number;
  source_class: string;
  target: string;
  scope: string;
  success_metric: string;
  payload: Record<string, unknown>;
};

// Only the operations used by this queue; also permits a local test adapter.
export type QueueClient = {
  from(table: "runtime_jobs"): {
    select(columns: "task_id"): {
      eq(column: "task_id", value: string): {
        maybeSingle(): PromiseLike<{
          data: { task_id: string } | null;
          error: QueueError | null;
        }>;
      };
    };
    insert(row: JobRow): PromiseLike<{ error: QueueError | null }>;
  };
};

export async function stableTaskId(
  prefix: string,
  url: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(url),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  // Preserve the existing key format, including previously queued opportunities.
  return `${prefix}-${hex.slice(0, 24)}`;
}

function rewardPriority(reward: number | null): number {
  if (reward == null) return 3;
  if (reward >= 5000) return 90;
  if (reward >= 1000) return 70;
  if (reward >= 250) return 50;
  if (reward >= 50) return 30;
  return 15;
}

export async function queueOpportunity(
  sb: QueueClient,
  prefix: string,
  opp: Opportunity,
): Promise<"inserted" | "skipped"> {
  const taskId = await stableTaskId(prefix, opp.url);
  const { data: existing, error: lookupError } = await sb.from("runtime_jobs")
    .select("task_id").eq("task_id", taskId).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) return "skipped";

  const { error } = await sb.from("runtime_jobs").insert({
    task_id: taskId,
    agent_role: "research_agent_external",
    status: "queued",
    task_kind: opp.reward_usd != null ? "bounty_solving" : "research",
    priority: rewardPriority(opp.reward_usd),
    source_class: "external_discovery",
    target: opp.url,
    scope: opp.source,
    success_metric: "submit_solution_and_capture_commission",
    payload: {
      source: opp.source,
      url: opp.url,
      title: opp.title,
      reward_usd: opp.reward_usd,
      tech_stack: opp.tech_stack ?? [],
      raw: opp.raw,
    },
  });
  if (error) {
    // PostgreSQL's UNIQUE constraint also prevents concurrent duplicate inserts.
    if (error.code === "23505") return "skipped";
    throw new Error(error.message);
  }
  return "inserted";
}
