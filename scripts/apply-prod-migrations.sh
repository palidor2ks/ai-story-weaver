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
# Env: SUPABASE_DB_URL (Supabase → Connect → Session pooler URI, port 5432 — session mode
# supports the DDL / DO blocks / CREATE EXTENSION these migrations use; the transaction
# pooler on 6543 does not, and the direct db.<ref> host is IPv6-only so it is unreachable
# from GitHub's IPv4 runners).
#
# IMPORTANT: this script intentionally FAILS (non-zero) when a push adds migration files but
# SUPABASE_DB_URL is not configured. It used to exit 0 in that case, which let migrations go
# unapplied to production silently (green build, nothing applied) — the failure mode this
# guard exists to make visible. Pushes that add no migration files stay green regardless.
set -euo pipefail

BEFORE="${1:-}"
AFTER="${2:-HEAD}"

# Determine the set of newly ADDED migration files in this push (no DB access needed yet).
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

# There ARE migrations to apply, so the production connection string is required. Fail loudly
# instead of skipping, so an unset/rotated secret can't silently leave prod un-migrated.
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "::error::SUPABASE_DB_URL is not set, but this push adds ${#files[@]} migration file(s) that must be applied to production. These migrations have NOT been applied."
  echo "Fix: add the SUPABASE_DB_URL repository secret (GitHub → Settings → Secrets and variables → Actions)."
  echo "Value: Supabase Dashboard → Connect → Session pooler URI (port 5432), e.g."
  echo "  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
  echo "Then re-run this workflow (Actions → Apply new migrations to Supabase production → Run workflow)."
  exit 1
fi

run() { psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }

# Ledger of files this workflow has applied (separate from Lovable's ledger).
run -c "create table if not exists public.claude_migration_log(
  filename text primary key,
  applied_at timestamptz not null default now());"

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
