#!/usr/bin/env bash
# Preflight data-health probes: itemize per-source errors (e.g. HTTP 403) instead of letting
# them hide inside other steps' logs. Probes the data sources the app/build actually depends on:
#   • Supabase REST (anon key) — the tables generate-sitemap.ts fetches
#   • Direct DB (SUPABASE_DB_URL + psql) — what migrations and check-duplicate-candidates use
#   • FEC API — what the finance edge functions verify against
# Read-only; never prints secrets (the anon key is public by design — RLS protects the data).
#
# Exit codes:  0 = all probed sources OK   1 = one or more errors (each itemized above)
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_URL="${VITE_SUPABASE_URL:-https://ornnzinjrcyigazecctf.supabase.co}"

# Anon (publishable) key — public by design (RLS protects the data; it ships in the client
# bundle). Resolution order: env var, then .env, then the copy already committed in
# generate-sitemap.ts. No literal here: one in-repo copy is enough, and a second one just
# trips secret scanners (GitGuardian flagged exactly that).
ANON_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
if [ -z "$ANON_KEY" ] && [ -f "$SCRIPT_DIR/../.env" ]; then
  ANON_KEY=$(grep -E '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$SCRIPT_DIR/../.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi
if [ -z "$ANON_KEY" ] && [ -f "$SCRIPT_DIR/generate-sitemap.ts" ]; then
  ANON_KEY=$(grep -oE '"eyJ[A-Za-z0-9_.-]+"' "$SCRIPT_DIR/generate-sitemap.ts" | head -1 | tr -d '"')
fi

ERRORS=0
HTTP403=0
PROBES=0

probe_rest() {
  local table="$1" code
  PROBES=$((PROBES + 1))
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    "$SUPABASE_URL/rest/v1/$table?select=*&limit=1" 2>/dev/null)
  if [ "$code" = "200" ] || [ "$code" = "206" ]; then
    echo "[data-health] OK    supabase-rest $table"
  else
    echo "[data-health] ERROR supabase-rest $table -> HTTP ${code:-000 (no response)}"
    ERRORS=$((ERRORS + 1))
    [ "$code" = "403" ] && HTTP403=$((HTTP403 + 1))
  fi
}

# The tables the sitemap build step depends on.
if [ -n "$ANON_KEY" ]; then
  for t in candidates party_platforms candidate_committees polls; do
    probe_rest "$t"
  done
else
  echo "[data-health] SKIP  supabase-rest — no publishable key found (env, .env, or generate-sitemap.ts)"
fi

# Direct DB (used by migrations + the duplicate-candidate check).
if [ -n "${SUPABASE_DB_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  PROBES=$((PROBES + 1))
  if timeout 8 psql "$SUPABASE_DB_URL" -X -tA -c 'select 1' >/dev/null 2>&1; then
    echo "[data-health] OK    direct-db (psql)"
  else
    echo "[data-health] ERROR direct-db (psql) -> unreachable"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "[data-health] SKIP  direct-db — SUPABASE_DB_URL unset or psql missing"
fi

# FEC API (finance verification source).
PROBES=$((PROBES + 1))
fec_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
  "https://api.open.fec.gov/v1/candidates/?api_key=${FEC_API_KEY:-DEMO_KEY}&per_page=1" 2>/dev/null)
if [ "$fec_code" = "200" ]; then
  echo "[data-health] OK    fec-api"
else
  echo "[data-health] ERROR fec-api -> HTTP ${fec_code:-000 (no response)}"
  ERRORS=$((ERRORS + 1))
  [ "$fec_code" = "403" ] && HTTP403=$((HTTP403 + 1))
fi

if [ "$ERRORS" -eq 0 ]; then
  echo "[data-health] all $PROBES probed sources OK"
  exit 0
fi

echo "[data-health] $ERRORS of $PROBES probes failed."
if [ "$HTTP403" -ge 2 ] && [ "$HTTP403" -eq "$ERRORS" ]; then
  echo "[data-health] hint: ALL failures are HTTP 403 across unrelated hosts — that pattern is"
  echo "[data-health] an environment egress policy (sandbox network restrictions), not a data or"
  echo "[data-health] permissions problem in the sources themselves. Re-run from CI/local network"
  echo "[data-health] to check the sources for real."
fi
exit 1
