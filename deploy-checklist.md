# Deployment Checklist — Runtime Open Federation

Use this when reconnecting or creating a new Supabase project.

## 1. Supabase project setup

```bash
# Create a new project at https://database.new
# Copy:
#   Project URL: https://<ref>.supabase.co
#   anon key: eyJ...
#   service_role key: eyJ...
```

## 2. Set environment secrets in Supabase

In Supabase Dashboard → Edge Functions → Secrets, add:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...   (or sk_test_... for dev)
OPENAI_API_KEY=sk-...           (optional — for AI routing)
```

## 3. Apply migrations

```bash
npx supabase db push --project-ref <your-ref>
```

## 4. Deploy all edge functions

```bash
npx supabase functions deploy --project-ref <your-ref>
```

Functions to deploy:
- `runtime-public-federation`
- `runtime-partnership`
- `runtime-payments`
- `runtime-canonical`
- `runtime-mcp-server`
- `runtime-growth-engine`
- `multi-ai-system`

## 5. Smoke test

```bash
PROJECT_URL=https://<ref>.supabase.co

curl $PROJECT_URL/functions/v1/runtime-public-federation/manifest | jq .federation.stats
curl $PROJECT_URL/functions/v1/runtime-public-federation/evolution | jq .nodes
curl $PROJECT_URL/functions/v1/runtime-canonical | jq .name
curl $PROJECT_URL/functions/v1/runtime-mcp-server | jq .tools
```

## 6. Update URLs in public files

If your new project URL differs from `kjtirbnxxymeumycrhqv.supabase.co`,
find/replace it in:
- `public/llms.txt`
- `public/agent-index.json`
- `public/.well-known/ai-plugin.json`
- `public/.well-known/mcp.json`
- `public/openapi.yaml`
- `public/integrations/*.py`
- `public/integrations/*.json`
- `public/federation.html`
- `public/integrations.html`

```bash
# Quick replace (run from repo root):
find public supabase -type f | xargs sed -i 's/kjtirbnxxymeumycrhqv.supabase.co/<new-ref>.supabase.co/g'
```

## 7. Rebuild GitHub Pages

```bash
git add . && git commit -m "chore: update Supabase project URL" && git push
```

GitHub Pages auto-deploys from main in ~60 seconds.

## 8. Verify public endpoints

```bash
curl https://nexussyn.github.io/ai-growth-platform/llms.txt
curl https://nexussyn.github.io/ai-growth-platform/.well-known/ai-plugin.json
curl https://nexussyn.github.io/ai-growth-platform/.well-known/mcp.json
curl https://nexussyn.github.io/ai-growth-platform/openapi.yaml
curl https://nexussyn.github.io/ai-growth-platform/agent-index.json
```

All should return valid JSON/text and be publicly accessible.

## Done ✓

The federation is live. Register your first agent:

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/runtime-public-federation/register \
  -H "Content-Type: application/json" \
  -d '{"manifest_url":"https://nexussyn.github.io/ai-growth-platform/agent-manifest.json",
       "display_name":"RuntimeBot",
       "capabilities":["code","research"]}'
```
