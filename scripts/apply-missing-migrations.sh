#!/usr/bin/env bash
# Apply the BACKLOG of migration files that exist in supabase/migrations/ but were
# never applied to a target database. Companion to apply-prod-migrations.sh, which
# only applies the files newly ADDED in a single push.
#
# Why this exists: in this repo's Lovable + Supabase setup, migrations authored
# outside Lovable (clean-numbered files committed via Claude/git, e.g.
# 20260604040000_*.sql) are NOT auto-applied to the Lovable-managed databases.
# Over time a project's DB can fall behind the repo by dozens of migrations. The
# Lovable-applied migrations are also recorded under slightly different version
# numbers than the repo filenames (a 1-2s offset), so a naive `supabase db push`
# would try to replay everything. This script closes the gap precisely: it applies
# only the files that have no matching ledger entry, in version order.
#
# It is SAFE BY DEFAULT:
#   * --dry-run is the default; you must pass --apply to make changes.
#   * Migrations that schedule pg_cron jobs are SKIPPED unless --include-crons is
#     given (recurring background jobs hit external APIs / spend budget).
#   * Files listed in SKIP_VERSIONS are never applied (data-overwrite landmines).
#   * Each applied file is recorded in public.claude_migration_log so re-runs are
#     idempotent, and offset-matched (already-applied) versions are skipped.
#
# Usage:
#   SUPABASE_DB_URL=... scripts/apply-missing-migrations.sh            # dry-run (default)
#   SUPABASE_DB_URL=... scripts/apply-missing-migrations.sh --apply    # apply non-cron backlog
#   SUPABASE_DB_URL=... scripts/apply-missing-migrations.sh --apply --include-crons
#
# Env: SUPABASE_DB_URL — Supabase -> Connect -> Session pooler URI (port 5432). Session
#      mode supports the DDL / DO blocks / CREATE EXTENSION these migrations use; the
#      transaction pooler (6543) does not. Point it at the DEV project you are syncing.
set -euo pipefail

MIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/migrations"
APPLY=0
INCLUDE_CRONS=0
TOLERANCE=5  # seconds: treat a repo version as already-applied if the ledger has one within +/- this

# Data-overwrite landmines to never auto-apply (reason in comments):
#  20260606000000 — re-sets Donald Trump's image_url to a Wikimedia URL, which would
#                   overwrite the self-hosted Storage photo. The data is already correct.
SKIP_VERSIONS=("20260606000000")

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --include-crons) INCLUDE_CRONS=1 ;;
    --dry-run) APPLY=0 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "::error:: SUPABASE_DB_URL is not set. Set it to the target project's Session pooler URI." >&2
  echo "  Supabase Dashboard -> Connect -> Session pooler (port 5432)." >&2
  exit 1
fi

psqlq() { psql "$SUPABASE_DB_URL" -X -tA -v ON_ERROR_STOP=1 "$@"; }

is_skip_version() { local v="$1"; for s in "${SKIP_VERSIONS[@]}"; do [ "$s" = "$v" ] && return 0; done; return 1; }
is_cron_file()    { grep -qiE 'cron\.schedule|cron\.unschedule|pg_cron' "$1"; }
has_concurrently(){ grep -qiE 'concurrently' "$1"; }

# Idempotency ledger (separate from Lovable's supabase_migrations.schema_migrations).
psqlq -c "create table if not exists public.claude_migration_log(
  filename text primary key,
  applied_at timestamptz not null default now());" >/dev/null

# Pull both ledgers once.
mapfile -t APPLIED_VERSIONS < <(psqlq -c "select version from supabase_migrations.schema_migrations;" || true)
mapfile -t APPLIED_FILES    < <(psqlq -c "select filename from public.claude_migration_log;" || true)
declare -A APPLIED_FILE_SET=(); for f in "${APPLIED_FILES[@]}"; do APPLIED_FILE_SET["$f"]=1; done

version_already_applied() { # numeric +/- TOLERANCE match against the Lovable ledger
  local ver="$1" v
  for v in "${APPLIED_VERSIONS[@]}"; do
    [[ "$v" =~ ^[0-9]{14}$ ]] || continue
    if (( v >= ver - TOLERANCE && v <= ver + TOLERANCE )); then return 0; fi
  done
  return 1
}

echo "Mode: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)   include-crons: $INCLUDE_CRONS"
echo "Target ledger: ${#APPLIED_VERSIONS[@]} schema_migrations rows, ${#APPLIED_FILES[@]} claude_migration_log rows"
echo

applied=0 skipped_cron=0 skipped_landmine=0 skipped_present=0 to_apply=0
for path in $(ls "$MIG_DIR"/*.sql | sort); do
  base="$(basename "$path")"
  ver="${base%%_*}"
  [[ "$ver" =~ ^[0-9]{14}$ ]] || { echo "skip (unparseable version): $base"; continue; }

  if [ -n "${APPLIED_FILE_SET[$base]:-}" ] || version_already_applied "$ver"; then
    skipped_present=$((skipped_present+1)); continue
  fi
  if is_skip_version "$ver"; then
    echo "SKIP landmine:  $base"; skipped_landmine=$((skipped_landmine+1)); continue
  fi
  if is_cron_file "$path" && [ "$INCLUDE_CRONS" = 0 ]; then
    echo "PAUSE cron:     $base   (re-run with --include-crons to schedule)"; skipped_cron=$((skipped_cron+1)); continue
  fi

  to_apply=$((to_apply+1))
  if [ "$APPLY" = 0 ]; then
    echo "WOULD apply:    $base$(has_concurrently "$path" && echo '   [CONCURRENTLY: no single-txn]')"
    continue
  fi

  echo "==> applying     $base"
  if has_concurrently "$path"; then
    psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f "$path"            # CONCURRENTLY cannot run in a txn
  else
    psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$path"
  fi
  psqlq -c "insert into public.claude_migration_log(filename) values ('${base}')
            on conflict (filename) do nothing;" >/dev/null
  echo "    applied + logged"
  applied=$((applied+1))
done

echo
echo "Summary: already-present=$skipped_present  landmines-skipped=$skipped_landmine  crons-paused=$skipped_cron"
if [ "$APPLY" = 0 ]; then
  echo "Dry-run: $to_apply migration(s) WOULD be applied. Re-run with --apply to execute."
else
  echo "Applied $applied migration(s)."
fi
