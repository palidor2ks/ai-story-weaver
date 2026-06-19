#!/usr/bin/env bash
# Preflight infra-health check: Supabase Postgres disk usage (OPEN-WORK #6).
#
# Why this exists: on 2026-06-13 the daily donor-consolidated matview refresh failed because
# the DB was near its disk ceiling and a non-concurrent REFRESH needs ~2x the matview's size in
# transient free space (the biggest MV is ~700 MB, so it needs ~1.5 GB headroom to rebuild).
# `contributions` (7+ GB) keeps growing, so the DB creeps back toward the ceiling. This check
# gives an early warning every preflight so we act BEFORE the next refresh OOMs — the owner
# monitors the authoritative number in the Supabase dashboard; this is the trend tripwire.
#
# Reports the current DB size vs the configured ceiling and whether enough free space remains
# for the matview refresh. The ceiling is a PLATFORM setting Postgres can't read, so it's
# supplied via env (default below) and should be kept in sync with the dashboard's disk size.
#
#   POLIPULSE_DISK_MAX_GB        provisioned disk ceiling in GB        (default 15)
#   POLIPULSE_DISK_REFRESH_GB    transient headroom the MV refresh needs (default 1.5)
#   POLIPULSE_DISK_WARN_PCT      warn when used% reaches this           (default 85)
#
# Read-only. Needs SUPABASE_DB_URL (Session-pooler URI, port 5432) + psql. Without them it
# SKIPS (exit 2) — recoverable via the Supabase MCP (see SKILL.md), so it never blocks a push.
#
# Exit codes:  0 = OK   1 = AT MAX (refresh would fail / over warn threshold)   2 = skipped (no DB)
set +e

MAX_GB="${POLIPULSE_DISK_MAX_GB:-27}"
REFRESH_GB="${POLIPULSE_DISK_REFRESH_GB:-1.5}"
WARN_PCT="${POLIPULSE_DISK_WARN_PCT:-85}"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "[disk] SKIPPED — SUPABASE_DB_URL unset (see docs/dev-migration-resync.md)."
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "[disk] SKIPPED — psql not installed."
  exit 2
fi
if ! timeout 8 psql "$SUPABASE_DB_URL" -X -tA -c 'select 1' >/dev/null 2>&1; then
  echo "[disk] SKIPPED — database unreachable (check network policy / pooler host)."
  exit 2
fi

# Bytes used across ALL databases on the cluster (closest SQL-visible proxy for disk; the
# Supabase dashboard's "disk size" also includes WAL/temp, so treat this as a floor).
USED_BYTES="$(timeout 15 psql "$SUPABASE_DB_URL" -X -tA -c \
  'select coalesce(sum(pg_database_size(datname)),0) from pg_database;' 2>/dev/null)"
if [ -z "$USED_BYTES" ]; then
  echo "[disk] SKIPPED — could not read pg_database_size (permission or timeout)."
  exit 2
fi

# All arithmetic in awk (floats); emit the human line + a CONDITION token the shell branches on.
read -r COND LINE1 LINE2 <<EOF
$(awk -v used="$USED_BYTES" -v max="$MAX_GB" -v refresh="$REFRESH_GB" -v warn="$WARN_PCT" 'BEGIN {
  gb  = used/1024/1024/1024;
  pct = (max>0) ? (gb/max*100) : 0;
  free = max - gb;
  cond = "OK";
  if (free < refresh) cond = "ATMAX";        # not enough headroom for the next MV refresh
  else if (pct >= warn) cond = "WARN";
  printf "%s|current DB ~%.2f GB / ceiling %.0f GB (%.0f%% used, %.2f GB free)|matview refresh needs ~%.1f GB transient headroom -> %.2f GB free\n", \
         cond, gb, max, pct, free, refresh, free;
}' | tr '|' '\t')
EOF

# Only AT MAX fails the gate (free space below the refresh headroom = the next daily MV refresh
# will likely OOM, exactly the 2026-06-13 failure). WARN is a non-blocking heads-up so the normal
# post-cleanup operating point (~87% with headroom intact) doesn't fail every push — that would
# be alert fatigue, not signal.
case "$COND" in
  ATMAX)
    echo "[disk] ERROR — AT MAX: $LINE1"
    echo "[disk]   $LINE2 (refresh will likely OOM). Fix: expand disk in Supabase dashboard, and/or prune/partition contributions (OPEN-WORK #6)."
    exit 1 ;;
  WARN)
    echo "[disk] WARN — approaching ceiling: $LINE1"
    echo "[disk]   $LINE2 (headroom still intact; not blocking). Plan the #6 durable fix before it tips over."
    exit 0 ;;
  *)
    echo "[disk] OK — $LINE1"
    echo "[disk]   $LINE2."
    exit 0 ;;
esac
