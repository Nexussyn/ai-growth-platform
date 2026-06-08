#!/usr/bin/env bash
# Runtime Open Federation — Smoke Test
# Usage: bash smoke-test.sh [project_url]
# Default project URL is the current Supabase project.

PROJECT_URL=${1:-"https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1"}
GH_PAGES="https://nexussyn.github.io/ai-growth-platform"

PASS=0; FAIL=0

check() {
  local label=$1; local url=$2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$url")
  if [[ "$code" == "200" || "$code" == "201" ]]; then
    echo "  ✓  $label ($code)"
    ((PASS++))
  else
    echo "  ✗  $label ($code) — $url"
    ((FAIL++))
  fi
}

echo ""
echo "━━━ Runtime Open Federation — Smoke Test ━━━"
echo "Backend : $PROJECT_URL"
echo "Frontend: $GH_PAGES"
echo ""

echo "── Edge Functions"
check "manifest"   "$PROJECT_URL/runtime-public-federation/manifest"
check "evolution"  "$PROJECT_URL/runtime-public-federation/evolution"
check "canonical"  "$PROJECT_URL/runtime-canonical"
check "mcp-server" "$PROJECT_URL/runtime-mcp-server"
check "partnership" "$PROJECT_URL/runtime-partnership/manifest"
check "products"   "$PROJECT_URL/runtime-payments/products"
check "growth-engine" "$PROJECT_URL/runtime-growth-engine"

echo ""
echo "── GitHub Pages"
check "index"         "$GH_PAGES/index.html"
check "federation"    "$GH_PAGES/federation.html"
check "integrations"  "$GH_PAGES/integrations.html"
check "llms.txt"      "$GH_PAGES/llms.txt"
check "openapi"       "$GH_PAGES/openapi.yaml"
check "ai-plugin"     "$GH_PAGES/.well-known/ai-plugin.json"
check "mcp.json"      "$GH_PAGES/.well-known/mcp.json"
check "agent-index"   "$GH_PAGES/agent-index.json"
check "sdk"           "$GH_PAGES/integrations/runtime-sdk.js"
check "badge"         "$GH_PAGES/badges/open-federation.svg"

echo ""
echo "━━━ Results: $PASS passed, $FAIL failed ━━━"
[[ $FAIL -eq 0 ]] && echo "✓ All systems operational" && exit 0
echo "✗ Some checks failed — see above" && exit 1
