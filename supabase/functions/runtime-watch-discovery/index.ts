import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UA = "runtime-watch-discovery/1.0 (+open-source-federation)";

type Candidate = {
  source: string;
  candidate_kind: string;
  name: string;
  url: string;
  license: string;
  evidence: Record<string, unknown>;
  score: number;
};

async function searchGithub(q: string): Promise<Candidate[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=10&sort=updated`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const items: Array<Record<string, unknown>> = (j?.items as Array<Record<string, unknown>>) || [];
  return items.slice(0, 10).map((it): Candidate => {
    const fullName = String(it.full_name || "");
    const repoUrl = String(it.html_url || "");
    const license = String((it.license as Record<string, unknown> | null)?.spdx_id || "");
    const stars = Number(it.stargazers_count || 0);
    return {
      source: "github",
      candidate_kind: "agentic_repo",
      name: fullName,
      url: repoUrl,
      license,
      evidence: {
        description: String(it.description || "").slice(0, 240),
        stars,
        language: String(it.language || ""),
        updated_at: String(it.updated_at || ""),
        api_url: String(it.url || ""),
      },
      score: Math.min(1, stars / 10000),
    };
  });
}

async function searchHN(q: string): Promise<Candidate[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=10&tags=story`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const hits: Array<Record<string, unknown>> = (j?.hits as Array<Record<string, unknown>>) || [];
  const cands: Candidate[] = [];
  for (const h of hits.slice(0, 10)) {
    const u = String(h.url || "");
    if (!u || !/^https?:\/\//.test(u)) continue;
    cands.push({
      source: "hn",
      candidate_kind: "article_or_endpoint",
      name: String(h.title || h.story_title || "").slice(0, 200),
      url: u,
      license: "",
      evidence: {
        points: Number(h.points || 0),
        author: String(h.author || ""),
        created_at: String(h.created_at || ""),
        objectID: String(h.objectID || ""),
      },
      score: Math.min(1, Number(h.points || 0) / 500),
    });
  }
  return cands;
}

async function searchOpenAlex(q: string): Promise<Candidate[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=5&mailto=runtime@bridge.local`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const items: Array<Record<string, unknown>> = (j?.results as Array<Record<string, unknown>>) || [];
  const cands: Candidate[] = [];
  for (const it of items.slice(0, 5)) {
    const id = String(it.id || "");
    if (!id) continue;
    cands.push({
      source: "openalex",
      candidate_kind: "scholarly_work",
      name: String(it.title || "").slice(0, 200),
      url: id,
      license: String(it.license || ""),
      evidence: {
        cited_by_count: Number(it.cited_by_count || 0),
        publication_year: Number(it.publication_year || 0),
        doi: String(it.doi || ""),
      },
      score: Math.min(1, Number(it.cited_by_count || 0) / 200),
    });
  }
  return cands;
}

async function searchArxiv(q: string): Promise<Candidate[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=5&sortBy=submittedDate&sortOrder=descending`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const text = await r.text();
  const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 5);
  const cands: Candidate[] = [];
  for (const m of entries) {
    const blob = m[1];
    const title = (blob.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim().replace(/\s+/g, " ").slice(0, 200);
    const id = (blob.match(/<id>([\s\S]*?)<\/id>/)?.[1] || "").trim();
    if (!id) continue;
    cands.push({
      source: "arxiv",
      candidate_kind: "preprint",
      name: title,
      url: id,
      license: "open",
      evidence: { abstract_excerpt: (blob.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || "").trim().slice(0, 240) },
      score: 0.3,
    });
  }
  return cands;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: seeds, error: sErr } = await sb
      .from("runtime_watch_seeds")
      .select("id, source, query, language, weight, last_run_at")
      .eq("active", true)
      .order("last_run_at", { ascending: true, nullsFirst: true })
      .limit(4);

    if (sErr) {
      return new Response(JSON.stringify({ ok: false, error: sErr.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const seedRows = seeds ?? [];
    let inserted = 0;
    let skipped = 0;
    const detail: Record<string, unknown>[] = [];

    for (const seed of seedRows) {
      let cands: Candidate[] = [];
      try {
        if (seed.source === "github") cands = await searchGithub(seed.query);
        else if (seed.source === "hn") cands = await searchHN(seed.query);
        else if (seed.source === "openalex") cands = await searchOpenAlex(seed.query);
        else if (seed.source === "arxiv") cands = await searchArxiv(seed.query);
      } catch (e) {
        await sb.rpc("record_pulse", {
          p_kind: "heartbeat", p_source: seed.source, p_subject: seed.query,
          p_details: { error: e instanceof Error ? e.message : String(e) },
        });
        continue;
      }

      for (const c of cands) {
        const { error: insErr } = await sb.from("runtime_provider_candidates").insert({
          source: c.source,
          candidate_kind: c.candidate_kind,
          name: c.name,
          url: c.url,
          license: c.license,
          status: "discovered",
          score: c.score,
          evidence: { ...c.evidence, seed_query: seed.query, seed_language: seed.language },
        });
        if (insErr) {
          if (String(insErr.message || "").includes("duplicate") || String(insErr.code || "") === "23505") skipped++;
          else skipped++;
        } else {
          inserted++;
          await sb.rpc("record_pulse", {
            p_kind: "discovered", p_source: c.source, p_subject: c.url,
            p_details: { name: c.name, license: c.license, score: c.score, language: seed.language },
          });
        }
      }

      await sb.from("runtime_watch_seeds").update({
        last_run_at: new Date().toISOString(),
        last_results: cands.length,
      }).eq("id", seed.id);

      detail.push({ source: seed.source, query: seed.query, language: seed.language, found: cands.length });
    }

    return new Response(JSON.stringify({ ok: true, seeds: seedRows.length, inserted, skipped, detail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
