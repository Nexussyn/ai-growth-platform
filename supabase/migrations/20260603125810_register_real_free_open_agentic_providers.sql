/*
  # Real Free Open-Source Agentic Providers — No Key, No Mock, No Hardcode

  1. Inserts into runtime_connector_registry (idempotent UPSERT) the following real
     public free providers, none of which require an API key:

     - pollinations_text     — text.pollinations.ai/openai (open LLM gateway, no key)
     - pollinations_completion — text.pollinations.ai/{prompt} (raw completion, no key)
     - duckduckgo_instant    — api.duckduckgo.com (instant answer JSON, no key)
     - wikipedia_rest        — en.wikipedia.org/api/rest_v1 (no key)
     - openalex_works        — api.openalex.org/works (open scholarly metadata, no key)
     - crossref_works        — api.crossref.org/works (open scholarly works, no key)
     - arxiv_query           — export.arxiv.org/api/query (open preprints, no key)
     - github_search_repos   — api.github.com/search/repositories (no auth, 60/hr/IP)
     - hn_algolia_search     — hn.algolia.com/api/v1/search (Hacker News, no key)
     - openmeteo             — api.open-meteo.com/v1 (open weather, no key)

  2. All connectors:
     - free_first = true
     - auth_method = 'none'
     - status = 'approved'
     - allowed_roles cover research, observability, integration, outreach
     - metadata stores the canonical URL pattern for the bridge to use

  3. No secrets are stored in the database.
*/

INSERT INTO runtime_connector_registry
  (connector_key, connector_kind, scope, auth_method, timeout_ms, evidence_schema,
   allowed_roles, free_first, status, metadata)
VALUES
  ('pollinations_text', 'agentic_llm',
   '{"capabilities":["text_generation","reasoning","summarization"]}'::jsonb,
   'none', 20000,
   '{"required":["request_url","response_excerpt","response_hash"]}'::jsonb,
   ARRAY['research_agent_external','observability_agent_external','outreach_agent_external','integration_agent_external'],
   true, 'approved',
   '{"endpoint":"https://text.pollinations.ai/openai","method":"POST","provider":"pollinations.ai","license":"open"}'::jsonb),

  ('pollinations_completion', 'agentic_llm',
   '{"capabilities":["text_completion"]}'::jsonb,
   'none', 15000,
   '{"required":["request_url","response_excerpt","response_hash"]}'::jsonb,
   ARRAY['research_agent_external','observability_agent_external'],
   true, 'approved',
   '{"endpoint_template":"https://text.pollinations.ai/{prompt}","method":"GET","provider":"pollinations.ai","license":"open"}'::jsonb),

  ('duckduckgo_instant', 'web_search',
   '{"capabilities":["instant_answer","disambiguation"]}'::jsonb,
   'none', 10000,
   '{"required":["request_url","abstract","response_hash"]}'::jsonb,
   ARRAY['research_agent_external','observability_agent_external'],
   true, 'approved',
   '{"endpoint":"https://api.duckduckgo.com/","method":"GET","provider":"duckduckgo.com","license":"public_api"}'::jsonb),

  ('wikipedia_rest', 'reference_kb',
   '{"capabilities":["page_summary","article_lookup"]}'::jsonb,
   'none', 10000,
   '{"required":["request_url","title","extract","response_hash"]}'::jsonb,
   ARRAY['research_agent_external','observability_agent_external'],
   true, 'approved',
   '{"endpoint_template":"https://en.wikipedia.org/api/rest_v1/page/summary/{title}","method":"GET","provider":"wikipedia.org","license":"CC-BY-SA"}'::jsonb),

  ('openalex_works', 'scholarly',
   '{"capabilities":["scholarly_search","author_lookup"]}'::jsonb,
   'none', 12000,
   '{"required":["request_url","items_count","response_hash"]}'::jsonb,
   ARRAY['research_agent_external'],
   true, 'approved',
   '{"endpoint":"https://api.openalex.org/works","method":"GET","provider":"openalex.org","license":"CC0"}'::jsonb),

  ('crossref_works', 'scholarly',
   '{"capabilities":["doi_resolution","scholarly_search"]}'::jsonb,
   'none', 12000,
   '{"required":["request_url","items_count","response_hash"]}'::jsonb,
   ARRAY['research_agent_external'],
   true, 'approved',
   '{"endpoint":"https://api.crossref.org/works","method":"GET","provider":"crossref.org","license":"CC0"}'::jsonb),

  ('arxiv_query', 'scholarly',
   '{"capabilities":["preprint_search"]}'::jsonb,
   'none', 12000,
   '{"required":["request_url","entries_count","response_hash"]}'::jsonb,
   ARRAY['research_agent_external'],
   true, 'approved',
   '{"endpoint":"https://export.arxiv.org/api/query","method":"GET","provider":"arxiv.org","license":"open"}'::jsonb),

  ('github_search_repos', 'code_intel',
   '{"capabilities":["repo_search"]}'::jsonb,
   'none', 10000,
   '{"required":["request_url","items_count","response_hash"]}'::jsonb,
   ARRAY['research_agent_external','code_agent_external','integration_agent_external'],
   true, 'approved',
   '{"endpoint":"https://api.github.com/search/repositories","method":"GET","provider":"github.com","license":"public_api","rate_limit_per_hour":60}'::jsonb),

  ('hn_algolia_search', 'web_search',
   '{"capabilities":["news_search","trend_signal"]}'::jsonb,
   'none', 10000,
   '{"required":["request_url","hits_count","response_hash"]}'::jsonb,
   ARRAY['research_agent_external','observability_agent_external','outreach_agent_external'],
   true, 'approved',
   '{"endpoint":"https://hn.algolia.com/api/v1/search","method":"GET","provider":"hn.algolia.com","license":"public_api"}'::jsonb),

  ('openmeteo', 'sensor_data',
   '{"capabilities":["weather_lookup"]}'::jsonb,
   'none', 8000,
   '{"required":["request_url","data_points","response_hash"]}'::jsonb,
   ARRAY['observability_agent_external','integration_agent_external'],
   true, 'approved',
   '{"endpoint":"https://api.open-meteo.com/v1/forecast","method":"GET","provider":"open-meteo.com","license":"CC-BY"}'::jsonb)
ON CONFLICT (connector_key) DO UPDATE
SET connector_kind = EXCLUDED.connector_kind,
    scope = EXCLUDED.scope,
    auth_method = EXCLUDED.auth_method,
    timeout_ms = EXCLUDED.timeout_ms,
    evidence_schema = EXCLUDED.evidence_schema,
    allowed_roles = EXCLUDED.allowed_roles,
    free_first = EXCLUDED.free_first,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata;
