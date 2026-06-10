#!/usr/bin/env bash
# Preflight data-ACCURACY scoreboard: reports where each data category stands against
# roadmap priority #1, reading the same admin_stats_cache rows the Coverage & Finance
# dashboard shows (recomputed every 15 min by refresh_admin_stats_cache(), migration
# 20260610170000). Read-only. Goals & thresholds: docs/DATA-ACCURACY.md.
#
# Exit codes:
#   0 = all categories within thresholds
#   1 = one or more categories failing (each itemized)
#   2 = skipped (no SUPABASE_DB_URL/psql) — the cache is admin-RLS, so the anon REST
#       key cannot read it; from an MCP-enabled agent session, read admin_stats_cache
#       via Supabase MCP execute_sql instead and apply the same thresholds.
set +e

if [ -z "${SUPABASE_DB_URL:-}" ] || ! command -v psql >/dev/null 2>&1; then
  echo "[data-accuracy] SKIPPED — SUPABASE_DB_URL unset or psql missing."
  echo "[data-accuracy] (agent sessions: query admin_stats_cache via Supabase MCP instead)"
  exit 2
fi

q() { timeout 10 psql "$SUPABASE_DB_URL" -X -tA -c "$1" 2>/dev/null; }

ERRORS=0
err()  { echo "[data-accuracy] ERROR $1"; ERRORS=$((ERRORS + 1)); }
ok()   { echo "[data-accuracy] OK    $1"; }
note() { echo "[data-accuracy] NOTE  $1"; }

# --- 0. Is the automation itself alive? (cron refreshes every 15 min; 2h = broken) ---
STALE_KEYS=$(q "select string_agg(k, ', ') from unnest(array['voting_records_stats','candidate_answer_stats','fec_stats','bills_stats','state_finance_stats','finance_recon_stats','identity_stats']) k
  where not exists (select 1 from admin_stats_cache c where c.stat_key = k and c.updated_at > now() - interval '2 hours')")
if [ -n "$STALE_KEYS" ]; then
  err "stats cache stale or missing for: $STALE_KEYS — the 15-min refresh cron is broken (or migration 20260610170000 isn't applied)"
else
  ok "stats cache fresh (all 7 keys < 2h old)"
fi

# --- 1. Federal finance: FEC reconciliation (threshold: errors must not grow past 900;
#        baseline 777 on 2026-06-10 — ratchet DOWN as they're fixed) ---
read -r RECON_ERR RECON_PART RECON_OK GAP <<<"$(q "select coalesce(stat_value->>'error','0'), coalesce(stat_value->>'partial','0'), coalesce(stat_value->>'ok','0'), coalesce(stat_value->>'errorGapUsd','0') from admin_stats_cache where stat_key='finance_recon_stats'" | tr '|' ' ')"
if [ "${RECON_ERR:-0}" -gt 900 ]; then
  err "fec-reconciliation: $RECON_ERR candidate-cycles in error (regression past 900) — gap \$$GAP"
else
  ok "fec-reconciliation: $RECON_OK ok / $RECON_PART partial / $RECON_ERR error (gap \$$GAP) — backlog tracked in docs/DATA-ACCURACY.md"
fi

# --- 2. Voting records (threshold: sync errors must not grow past 350; baseline 269) ---
read -r VERR VFERR VINC <<<"$(q "select coalesce(stat_value->>'syncErrors','0'), coalesce(stat_value->>'floorSyncErrors','0'), coalesce(stat_value->>'incompleteMembers','0') from admin_stats_cache where stat_key='voting_records_stats'" | tr '|' ' ')"
TOTAL_VERR=$(( ${VERR:-0} + ${VFERR:-0} ))
if [ "$TOTAL_VERR" -gt 350 ]; then
  err "voting-records: $TOTAL_VERR member sync errors (regression past 350); $VINC members incomplete"
else
  ok "voting-records: $TOTAL_VERR member sync errors / $VINC incomplete (baseline 269/270 on 2026-06-10)"
fi

# --- 3. Bills (FAIL if the nightly sync is dead: > 7 days since last completion) ---
read -r BSTALE BLAST <<<"$(q "select coalesce(stat_value->>'staleDays','-1'), coalesce(stat_value->>'lastNightlySync','never') from admin_stats_cache where stat_key='bills_stats'" | tr '|' ' ')"
if [ "${BSTALE:--1}" -gt 7 ] || [ "${BSTALE:--1}" -lt 0 ]; then
  err "bills: nightly sync DEAD — last completed $BLAST (${BSTALE}d ago). Fix recipe: docs/DATA-ACCURACY.md §Bills"
else
  ok "bills: nightly sync ${BSTALE}d ago"
fi

# --- 4. State campaign finance (FAIL on any sync errors in the last 7 days) ---
STATE_ERRS=$(q "select coalesce((stat_value->'nj'->>'errors7d')::int,0)+coalesce((stat_value->'fl'->>'errors7d')::int,0)+coalesce((stat_value->'ny'->>'errors7d')::int,0) from admin_stats_cache where stat_key='state_finance_stats'")
if [ "${STATE_ERRS:-0}" -gt 0 ]; then
  err "state-finance: $STATE_ERRS sync errors across NJ/FL/NY this week"
else
  ok "state-finance: NJ/FL/NY syncing clean (0 errors this week)"
fi

# --- 5. Candidate answers (informational until the sourcing goal is set: report both
#        definitions — description-sourced vs URL-sourced) ---
read -r ATOT ASRC AURL <<<"$(q "select coalesce(stat_value->>'totalAnswers','0'), coalesce(stat_value->>'totalSourced','0'), coalesce(stat_value->>'sourcedWithUrl','0') from admin_stats_cache where stat_key='candidate_answer_stats'" | tr '|' ' ')"
note "answers: $ATOT total — $ASRC with source description, $AURL with source URL (goal: docs/DATA-ACCURACY.md §Answers)"

if [ "$ERRORS" -eq 0 ]; then
  echo "[data-accuracy] all categories within thresholds"
  exit 0
fi
echo "[data-accuracy] $ERRORS categor$([ "$ERRORS" -eq 1 ] && echo y || echo ies) failing."
exit 1
