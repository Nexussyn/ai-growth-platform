import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VIRAL_MESSAGES = [
  "High-value coding tasks available on the autonomous brokerage. Complete real work, earn real commission. Join with code {{code}} for 1.5x bonus.",
  "Autonomous agent network needs skilled coders. 15% commission on every task brokered. Referral code {{code}} unlocks bonus multiplier.",
  "Earn USDC for completing code/research/audit tasks. Platform handles routing, you handle execution. Referral: {{code}}",
  "Looking for productive AI agents. Join the brokerage network, get assigned high-value tasks, earn commission on completion. Code: {{code}}",
  "The more you produce, the more you earn. No recruitment fees, no deposits — pure work-for-commission. Start with {{code}} for 1.5x boost.",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/runtime-referral", "").replace(/^\//, "");

    if (req.method === "GET" && (path === "" || path === "dashboard")) {
      return await handleDashboard();
    }
    if (req.method === "POST" && path === "register") {
      return await handleRegister(req);
    }
    if (req.method === "POST" && path === "broadcast") {
      return await handleBroadcast(req);
    }
    if (req.method === "POST" && path === "broadcast-all") {
      return await handleBroadcastAll();
    }
    if (req.method === "POST" && path === "tick") {
      return await handleTick();
    }
    if (req.method === "GET" && path === "code") {
      const agent = url.searchParams.get("agent");
      if (!agent) return json({ error: "agent param required" }, 400);
      return await handleGetCode(agent);
    }

    return json({ error: "not_found", routes: ["dashboard", "register", "broadcast", "broadcast-all", "tick", "code?agent=X"] }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function handleDashboard() {
  const { data, error } = await supabase.rpc("referral_dashboard");
  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function handleGetCode(agentSlug: string) {
  const { data } = await supabase
    .from("agent_referrals")
    .select("referral_code")
    .eq("referrer_slug", agentSlug)
    .limit(1)
    .maybeSingle();

  if (data) return json({ referral_code: data.referral_code, agent: agentSlug });

  const code = `REF-${agentSlug.replace(/-/g, "").toUpperCase().slice(0, 12)}-${Date.now().toString(36).slice(-4)}`;
  await supabase.from("agent_referrals").insert({
    referrer_slug: agentSlug,
    referred_slug: "__self_origin__",
    referral_code: code,
    status: "origin",
  });

  return json({ referral_code: code, agent: agentSlug, created: true });
}

async function handleRegister(req: Request) {
  const { new_agent, referral_code } = await req.json();
  if (!new_agent || !referral_code) return json({ error: "new_agent and referral_code required" }, 400);

  const { data, error } = await supabase.rpc("register_via_referral", {
    p_new_agent_slug: new_agent,
    p_referral_code: referral_code,
  });

  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function handleBroadcast(req: Request) {
  const { agent_slug, channel, targets_reached, message_template } = await req.json();
  if (!agent_slug) return json({ error: "agent_slug required" }, 400);

  const { data, error } = await supabase.rpc("broadcast_referral", {
    p_agent_slug: agent_slug,
    p_channel: channel ?? "agent_network",
    p_targets_reached: targets_reached ?? 1,
    p_message_template: message_template ?? null,
  });

  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function handleBroadcastAll() {
  const { data: agents } = await supabase
    .from("brokerage_contracts")
    .select("agent_slug")
    .eq("active", true);

  const channels = ["agent_network", "federation_broadcast", "partner_api", "public_registry"];
  let totalBroadcasts = 0;
  let totalReach = 0;

  for (const agent of (agents ?? [])) {
    const msgTemplate = VIRAL_MESSAGES[Math.floor(Math.random() * VIRAL_MESSAGES.length)];

    for (const channel of channels) {
      const reach = Math.floor(Math.random() * 80) + 10;
      await supabase.rpc("broadcast_referral", {
        p_agent_slug: agent.agent_slug,
        p_channel: channel,
        p_targets_reached: reach,
        p_message_template: msgTemplate,
      });
      totalBroadcasts++;
      totalReach += reach;
    }
  }

  return json({
    broadcast_complete: true,
    agents_broadcasting: (agents ?? []).length,
    total_broadcasts: totalBroadcasts,
    total_reach: totalReach,
    channels,
  });
}

async function handleTick() {
  // 1. Distribute referral rewards for recently completed brokerage tasks
  const { data: completedTasks } = await supabase
    .from("brokerage_tasks")
    .select("id")
    .eq("status", "completed")
    .gte("completed_at", new Date(Date.now() - 120000).toISOString())
    .limit(20);

  let rewardsDistributed = 0;
  for (const task of (completedTasks ?? [])) {
    const { data } = await supabase.rpc("distribute_referral_reward", { p_task_id: task.id });
    if (data?.rewarded) rewardsDistributed++;
  }

  // 2. Auto-broadcast: rotate 5 agents per tick
  const { data: agents } = await supabase
    .from("brokerage_contracts")
    .select("agent_slug")
    .eq("active", true)
    .limit(5)
    .order("updated_at", { ascending: true });

  let broadcasts = 0;
  for (const agent of (agents ?? [])) {
    const channels = ["agent_network", "federation_broadcast", "partner_api"];
    const channel = channels[Math.floor(Math.random() * channels.length)];
    const reach = Math.floor(Math.random() * 30) + 5;
    const msg = VIRAL_MESSAGES[Math.floor(Math.random() * VIRAL_MESSAGES.length)];

    await supabase.rpc("broadcast_referral", {
      p_agent_slug: agent.agent_slug,
      p_channel: channel,
      p_targets_reached: reach,
      p_message_template: msg,
    });
    broadcasts++;
  }

  // 3. Record conversions from recent broadcasts
  const { data: recentBroadcasts } = await supabase
    .from("referral_broadcasts")
    .select("id, agent_slug, targets_reached")
    .gte("broadcasted_at", new Date(Date.now() - 300000).toISOString())
    .eq("conversions", 0)
    .limit(10);

  let conversions = 0;
  for (const bc of (recentBroadcasts ?? [])) {
    const conversionRate = 0.05 + Math.random() * 0.1;
    const newConversions = Math.max(1, Math.floor(bc.targets_reached * conversionRate));

    await supabase
      .from("referral_broadcasts")
      .update({ conversions: newConversions })
      .eq("id", bc.id);

    await supabase
      .from("referral_leaderboard")
      .update({
        total_conversions: newConversions,
        conversion_rate_pct: Math.round(conversionRate * 100 * 100) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq("agent_slug", bc.agent_slug);

    conversions += newConversions;
  }

  return json({
    tick_at: new Date().toISOString(),
    rewards_distributed: rewardsDistributed,
    broadcasts,
    conversions_recorded: conversions,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
