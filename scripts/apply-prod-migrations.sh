#!/usr/bin/env bash
# Apply migration files ADDED in the triggering push to the PRODUCTION database.
#
# Why this exists: in this repo's Lovable + Supabase setup, merging to main deploys Edge
# Functions to production but does NOT apply migrations to production (Supabase Branching
# only applies them to preview-branch databases, and prod's migration ledger is managed by
# Lovable under different version numbers than the repo filenames). This script closes that
# gap by applying only the newly-added supabase/migrations/*.sql files from each push,
# recording them in public.claude_migration_log so re-runs are idempotent.
#
# Usage: apply-prod-migrations.sh <before_sha> <after_sha>
# Requires env: SUPABASE_DB_URL (Supabase → Settings → Database → Connection string;
# use the session/direct connection, not the transaction pooler, so DDL is supported).
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required (set it as a GitHub Actions secret)}"

BEFORE="${1:-}"
AFTER="${2:-HEAD}"

run() { psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }

# Ledger of files this workflow has applied (separate from Lovable's ledger).
run -c "create table if not exists public.claude_migration_log(
  filename text primary key,
  applied_at timestamptz not null default now());"

# Determine the set of newly ADDED migration files in this push.
if [ -n "$BEFORE" ] \
   && [ "$BEFORE" != "0000000000000000000000000000000000000000" ] \
   && git cat-file -e "${BEFORE}^{commit}" 2>/dev/null; then
  RANGE=("$BEFORE" "$AFTER")
else
  # First push / forced push / manual dispatch: fall back to the last commit only.
  RANGE=("${AFTER}~1" "$AFTER")
fi

mapfile -t files < <(
  git diff --name-only --diff-filter=A "${RANGE[@]}" -- 'supabase/migrations/' \
    | grep -E '\.sql$' | sort || true
)

if [ "${#files[@]}" -eq 0 ]; then
  echo "No newly added migration files in this push. Nothing to apply."
  exit 0
fi

echo "Found ${#files[@]} newly added migration file(s):"
printf '  - %s\n' "${files[@]}"

for f in "${files[@]}"; do
  [ -f "$f" ] || { echo "skip (not present in tree): $f"; continue; }
  base="$(basename "$f")"
  already="$(psql "$SUPABASE_DB_URL" -X -tA -c \
    "select 1 from public.claude_migration_log where filename = '${base}';")"
  if [ "$already" = "1" ]; then
    echo "skip (already applied): $base"
    continue
  fi
  echo "==> applying $base"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X --single-transaction -f "$f"
  run -c "insert into public.claude_migration_log(filename) values ('${base}')
          on conflict (filename) do nothing;"
  echo "    applied + logged: $base"
done

echo "All newly added migrations applied to production."
