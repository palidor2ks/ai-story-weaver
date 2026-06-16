#!/usr/bin/env bash
# Preflight data-ACCURACY scoreboard: reports where each data category stands against
# roadmap priority #1. The §0 freshness check reads admin_stats_cache (still recomputed every
# 15 min, whole-DB, by refresh_admin_stats_cache(), migration 20260610170000) to confirm the cron
# is alive. The candidate-scoped categories (§1 finance recon, §2 voting, §5 answers) compute the
# VISIBLE-states slice directly — the two-state focus means the gate measures only the states we
# maintain (matches the Coverage & Finance dashboard). Read-only. Goals & thresholds: docs/DATA-ACCURACY.md.
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

# Two-state focus (2026-06-16): the candidate-scoped categories below measure ONLY visible states
# (the states we still maintain — ingestion is gated to them). `admin_stats_cache` itself stays
# whole-database (the freshness check in §0 still validates the cron, and the cache is a whole-DB
# audit reference), so these checks compute the visible slice directly. Bills (national) and state
# finance (NJ/FL/NY) are not candidate-state-scoped and keep reading the cache.
VIS="with vis as (select id from candidates c where c.state is null or upper(c.state) not in (select upper(state_code) from hidden_states))"

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

# --- 1. Federal finance: FEC reconciliation, VISIBLE states only (threshold: errors must not grow
#        past 100; visible baseline ~40-55 on 2026-06-16 — ratchet DOWN as they're fixed) ---
read -r RECON_ERR RECON_PART RECON_OK GAP <<<"$(q "$VIS
  select count(*) filter (where fr.status='error'), count(*) filter (where fr.status='partial'),
         count(*) filter (where fr.status='ok'),
         coalesce(sum(fr.total_receipts_delta_amount) filter (where fr.status='error'),0)::bigint
  from finance_reconciliation fr join vis on vis.id = fr.candidate_id" | tr '|' ' ')"
if [ "${RECON_ERR:-0}" -gt 100 ]; then
  err "fec-reconciliation (visible): $RECON_ERR candidate-cycles in error (regression past 100) — gap \$$GAP"
else
  ok "fec-reconciliation (visible): $RECON_OK ok / $RECON_PART partial / $RECON_ERR error (gap \$$GAP) — backlog tracked in docs/DATA-ACCURACY.md"
fi

# --- 2. Voting records, VISIBLE states only (threshold: sync errors must not grow past 60;
#        visible baseline 18 errors / 12 incomplete on 2026-06-16) ---
read -r VERR VFERR VINC <<<"$(q "$VIS
  select count(*) filter (where vs.sync_error is not null),
         count(*) filter (where vs.floor_vote_sync_error is not null),
         count(*) filter (where coalesce(vs.persisted_count,0) < coalesce(vs.expected_total,0))
  from vote_sync_status vs join vis on vis.id = vs.candidate_id" | tr '|' ' ')"
TOTAL_VERR=$(( ${VERR:-0} + ${VFERR:-0} ))
if [ "$TOTAL_VERR" -gt 60 ]; then
  err "voting-records (visible): $TOTAL_VERR member sync errors (regression past 60); $VINC members incomplete"
else
  ok "voting-records (visible): $TOTAL_VERR member sync errors / $VINC incomplete (baseline 18/12 on 2026-06-16)"
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

# --- 5. Candidate answers, VISIBLE states only: URL-sourcing bands (maintainer 2026-06-10) —
#        target 100%, >=75% success, <35% poor (FAIL). Visible baseline ~4% on 2026-06-16. ---
read -r ATOT AURL <<<"$(q "$VIS
  select coalesce((select sum(s.answer_count) from candidate_answer_coverage_stats s join vis on vis.id = s.candidate_id),0),
         (select count(*) from candidate_answers a join vis on vis.id = a.candidate_id
            where a.source_url is not null or coalesce(array_length(a.source_urls,1),0) > 0)" | tr '|' ' ')"
APCT=0
[ "${ATOT:-0}" -gt 0 ] && APCT=$(( ${AURL:-0} * 100 / ATOT ))
if [ "$APCT" -lt 35 ]; then
  err "answers (visible): only ${APCT}% of $ATOT answers are URL-sourced ($AURL) — below the 35% floor (target 100%, success 75%)"
elif [ "$APCT" -lt 75 ]; then
  note "answers (visible): ${APCT}% URL-sourced ($AURL of $ATOT) — above the 35% floor, below the 75% success bar"
else
  ok "answers (visible): ${APCT}% URL-sourced ($AURL of $ATOT) — success bar (75%) met; target 100%"
fi

if [ "$ERRORS" -eq 0 ]; then
  echo "[data-accuracy] all categories within thresholds"
  exit 0
fi
echo "[data-accuracy] $ERRORS categor$([ "$ERRORS" -eq 1 ] && echo y || echo ies) failing."
exit 1
