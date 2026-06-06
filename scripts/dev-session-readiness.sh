#!/usr/bin/env bash
# SessionStart readiness probe for Supabase migration / DB work in Claude Code on the web.
# Prints a short status so the agent knows whether it can run db tasks this session.
# Never fails the session (always exits 0) and never prints secret values.
set +e

have() { command -v "$1" >/dev/null 2>&1 && echo "yes" || echo "no"; }

echo "[dev-readiness] psql=$(have psql)  supabase-cli=$(have supabase)  bunx=$(have bunx)"

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  # Presence only — never echo the connection string.
  reach="unknown"
  if command -v psql >/dev/null 2>&1; then
    if timeout 8 psql "$SUPABASE_DB_URL" -X -tA -c 'select 1' >/dev/null 2>&1; then
      reach="reachable"
    else
      reach="UNreachable (check network policy allows the pooler host)"
    fi
  fi
  echo "[dev-readiness] SUPABASE_DB_URL=set  db=$reach"
  echo "[dev-readiness] ready: scripts/apply-missing-migrations.sh (dry-run by default)"
else
  echo "[dev-readiness] SUPABASE_DB_URL=unset -> DB migration work is blocked."
  echo "[dev-readiness] See docs/dev-migration-resync.md to enable it."
fi
exit 0
