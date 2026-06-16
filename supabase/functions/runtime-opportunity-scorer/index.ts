// ============================================================================
// runtime-opportunity-scorer
// ----------------------------------------------------------------------------
// Moteur de SCORING + VALIDATION des opportunités de revenu réelles.
//
// Rôle dans la boucle opportuniste :
//   1. Lit les opportunités RÉELLES découvertes par runtime-opportunity-scout
//      (runtime_jobs, source_class='external_discovery') non encore scorées.
//   2. Pour chaque opportunité, appelle Claude (intelligence réelle) pour calculer
//      les 8 métriques exigées + un score 0-100.
//   3. Persiste le résultat dans revenue_opportunities (idempotent par evidence.task_id).
//   4. Applique les RÈGLES DE VALIDATION du propriétaire :
//        - Une source de revenu n'est PAS active tant qu'elle n'a pas de PREUVE
//          réelle de demande (reward on-chain extractible, signal de conversion,
//          ou évidence vérifiable).
//        - Score élevé + preuve de demande réelle  -> status='validated_candidate'
//          (éligible à promotion vers revenue_routes).
//        - Sinon -> status='backlog' (conservé, ré-évaluable plus tard).
//
// Principes : TOUT est réel. Aucune simulation, aucun faux revenu. Si Claude
// échoue, l'opportunité reste 'pending_score' et sera retentée (jamais de score
// fabriqué). La boucle ne bloque jamais le produit principal : une erreur sur une
// opportunité -> on passe à la suivante.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, claudeKeyPresent, sha256Hex } from "../_shared/claude.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Seuil de score minimal pour qu'une opportunité soit candidate à promotion.
const SCORE_PROMOTE_THRESHOLD = 65;

type Metrics = {
  value_hypothesis: string;
  target_user: string;
  time_to_validate_hours: number;
  implementation_cost: string;   // low | medium | high
  risk_level: string;            // low | medium | high
  expected_margin_pct: number;   // 0-100
  dependency_footprint: string;  // low | medium | high
  automation_potential: string;  // low | medium | high
  conversion_probability: number;// 0-100
  capital_intensity: string;
  resilience: string;
  strategic_optionality: string;
  comparison_vs_product: string;
  score: number;                 // 0-100
};

const SYSTEM_PROMPT = `Tu es un analyste d'opportunités de revenu pour une plateforme d'intermédiation par IA autonome.
La plateforme met en relation des intelligences artificielles et systèmes agentiques pour extraire un profit d'intermédiaire,
sur TOUT type de générateur de revenu mondial (bounties payés, commissions d'affiliation, lead-gen, facturation d'API,
automatisation de workflow, alertes payantes, enrichissement de données, services B2B, licensing, pricing à l'usage/performance, partenariats).

On te donne UNE opportunité réelle découverte. Évalue-la de façon réaliste et conservatrice.
Réponds STRICTEMENT en JSON valide (aucun texte hors JSON), avec EXACTEMENT ces clés :
{
 "value_hypothesis": string (1 phrase: comment on extrait un profit d'intermédiaire ici),
 "target_user": string (qui paie au final),
 "time_to_validate_hours": number (heures réalistes pour obtenir une 1ère preuve de demande),
 "implementation_cost": "low"|"medium"|"high",
 "risk_level": "low"|"medium"|"high",
 "expected_margin_pct": number (0-100, marge nette réaliste),
 "dependency_footprint": "low"|"medium"|"high" (dépendance à des tiers/API),
 "automation_potential": "low"|"medium"|"high" (capacité à collecter le revenu automatiquement),
 "conversion_probability": number (0-100, proba qu'une tentative réelle convertisse),
 "capital_intensity": "low"|"medium"|"high",
 "resilience": "low"|"medium"|"high",
 "strategic_optionality": "low"|"medium"|"high",
 "comparison_vs_product": string (1 phrase),
 "score": number (0-100, score global pondéré: privilégie marge*conversion*automatisation, pénalise risque*coût*dépendance)
}`;

function extractJson(text: string): Metrics | null {
  // Claude peut entourer le JSON de texte ; on extrait le 1er bloc {...}.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    return obj as Metrics;
  } catch {
    return null;
  }
}

// Détecte une PREUVE de demande réelle à partir du payload de l'opportunité.
// Aucune fabrication : on lit uniquement des signaux présents dans les données réelles.
function detectDemandEvidence(payload: Record<string, unknown>): { has_demand: boolean; evidence: Record<string, unknown> } {
  const raw = (payload?.raw ?? {}) as Record<string, unknown>;
  const ev: Record<string, unknown> = {};
  let has = false;

  // Reward on-chain / monétaire extractible
  const reward = payload?.reward_usd ?? raw?.reward ?? raw?.amount ?? raw?.bounty;
  if (reward != null && Number(reward) > 0) {
    ev.reward_usd = Number(reward);
    has = true;
  }
  // Concurrence active = demande prouvée (des gens "essaient" / "claiment" la bounty)
  const trying = Number(raw?.trying ?? 0);
  const claimers = Number(raw?.claimers ?? 0);
  if (trying > 0 || claimers > 0) {
    ev.competitors_active = trying + claimers;
    has = true;
  }
  // URL réelle vérifiable
  if (payload?.url || raw?.url) ev.url = payload?.url ?? raw?.url;

  return { has_demand: has, evidence: ev };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const url = new URL(req.url);
  const batchSize = Math.min(Number(url.searchParams.get("batch_size") || 6), 12);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  if (!claudeKeyPresent()) {
    return new Response(JSON.stringify({
      ok: false,
      error: "ANTHROPIC_API_KEY_missing",
      note: "Le scorer requiert la clé Claude réelle. Aucun score fabriqué.",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // 1) Récupérer les opportunités découvertes non encore scorées.
  //    On exclut celles déjà présentes dans revenue_opportunities (idempotence par task_id).
  const { data: jobs, error: jobsErr } = await supabase
    .from("runtime_jobs")
    .select("task_id, task_kind, target, payload")
    .eq("source_class", "external_discovery")
    .in("status", ["queued", "pending"])
    .limit(batchSize * 3);

  if (jobsErr) {
    return new Response(JSON.stringify({ ok: false, error: jobsErr.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const candidates = jobs ?? [];
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, scored: 0, note: "Aucune opportunité en attente de scoring." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Filtrer celles déjà scorées
  const taskIds = candidates.map((c) => c.task_id);
  const { data: existing } = await supabase
    .from("revenue_opportunities")
    .select("evidence")
    .in("source_type", ["external_discovery"])
    .limit(2000);
  const scoredTaskIds = new Set<string>(
    (existing ?? []).map((e) => (e.evidence as Record<string, unknown>)?.task_id as string).filter(Boolean),
  );

  const toScore = candidates.filter((c) => !scoredTaskIds.has(c.task_id)).slice(0, batchSize);

  const results: Array<Record<string, unknown>> = [];
  let scored = 0, promoted = 0, backlogged = 0, failed = 0;

  for (const job of toScore) {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const demand = detectDemandEvidence(payload);
    const title = String(payload?.title ?? job.target ?? job.task_id).slice(0, 200);

    const prompt = `Opportunité réelle découverte:
- Type: ${job.task_kind}
- Cible/URL: ${job.target}
- Données brutes: ${JSON.stringify(payload).slice(0, 1500)}
- Preuve de demande détectée: ${demand.has_demand ? JSON.stringify(demand.evidence) : "aucune preuve directe"}

Évalue cette opportunité et renvoie le JSON demandé.`;

    const res = await callClaude({ prompt, system: SYSTEM_PROMPT, maxTokens: 900, temperature: 0.3 });

    if (!res.ok) {
      // Échec réel : on ne fabrique rien, on passe à la suivante (la boucle continue).
      failed++;
      results.push({ task_id: job.task_id, ok: false, error: res.error, status_code: res.status_code });
      continue;
    }

    const m = extractJson(res.text);
    if (!m) {
      failed++;
      results.push({ task_id: job.task_id, ok: false, error: "claude_json_parse_failed" });
      continue;
    }

    // 4) Règle de validation : promotion seulement si score élevé ET demande réelle.
    const score = Math.max(0, Math.min(100, Math.round(Number(m.score) || 0)));
    const isCandidate = score >= SCORE_PROMOTE_THRESHOLD && demand.has_demand;
    const status = isCandidate ? "validated_candidate" : "backlog";
    if (isCandidate) promoted++; else backlogged++;

    const evidenceHash = await sha256Hex(job.task_id + "::" + res.text.slice(0, 256));

    const row = {
      source_type: "external_discovery",
      title,
      value_hypothesis: String(m.value_hypothesis ?? "").slice(0, 1000),
      target_user: String(m.target_user ?? "").slice(0, 500),
      time_to_validate_hours: Math.max(0, Math.round(Number(m.time_to_validate_hours) || 0)),
      implementation_cost: String(m.implementation_cost ?? "medium"),
      risk_level: String(m.risk_level ?? "medium"),
      expected_margin_pct: Math.max(0, Math.min(100, Math.round(Number(m.expected_margin_pct) || 0))),
      dependency_footprint: String(m.dependency_footprint ?? "medium"),
      automation_potential: String(m.automation_potential ?? "medium"),
      conversion_probability: Math.max(0, Math.min(100, Math.round(Number(m.conversion_probability) || 0))),
      capital_intensity: String(m.capital_intensity ?? "low"),
      resilience: String(m.resilience ?? "medium"),
      strategic_optionality: String(m.strategic_optionality ?? "medium"),
      comparison_vs_product: String(m.comparison_vs_product ?? "").slice(0, 1000),
      score,
      status,
      evidence: {
        task_id: job.task_id,
        target: job.target,
        task_kind: job.task_kind,
        demand_evidence: demand.evidence,
        has_real_demand: demand.has_demand,
        scored_by: "anthropic_claude",
        claude_cost_cents: res.cost_cents,
        evidence_hash: evidenceHash,
      },
      last_scored_at: new Date().toISOString(),
    };

    const { error: insErr } = await supabase.from("revenue_opportunities").insert(row);
    if (insErr) {
      failed++;
      results.push({ task_id: job.task_id, ok: false, error: insErr.message });
      continue;
    }
    scored++;
    results.push({ task_id: job.task_id, ok: true, score, status, has_demand: demand.has_demand });
  }

  return new Response(JSON.stringify({
    ok: true,
    scored, promoted, backlogged, failed,
    candidates_pending: candidates.length - scoredTaskIds.size,
    duration_ms: Date.now() - t0,
    results,
  }, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
});
