#!/usr/bin/env bash
# Preflight data-health check: duplicate candidate profiles.
#
# Surfaces candidates that look like the same person split across multiple rows — the
# class of bug fixed in docs/candidate-deduplication-plan.md (e.g. Seth Moulton as both a
# House and a Senate row). Two detection signals:
#   • shared active principal committee linked to >1 candidate_id (strongest), and
#   • identical normalized name + state across rows.
# A cluster is only an ERROR if it is UNTRIAGED — i.e. no row in candidate_merge_map links
# its members in any status. Pairs already merged/proposed/rejected are reported as
# context, not failures (a human has seen them; rejected = confirmed distinct people).
#
# Read-only. Needs SUPABASE_DB_URL (Session-pooler URI, port 5432) + psql. Without them it
# SKIPS (exit 2) rather than failing — so it never blocks a push in an env with no DB.
#
# Exit codes:  0 = clean / only-triaged   1 = untriaged duplicates found   2 = skipped (no DB)
set +e

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "[dupe-check] SKIPPED — SUPABASE_DB_URL unset (see docs/dev-migration-resync.md)."
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "[dupe-check] SKIPPED — psql not installed."
  exit 2
fi
if ! timeout 8 psql "$SUPABASE_DB_URL" -X -tA -c 'select 1' >/dev/null 2>&1; then
  echo "[dupe-check] SKIPPED — database unreachable (check network policy / pooler host)."
  exit 2
fi

# Shared CTE that buckets every duplicate cluster by triage state. Quoted heredoc so the
# regex backslashes reach Postgres intact.
read -r -d '' DUPE_CTE <<'SQL'
with shared as (
  select 'shared_committee'::text kind, fec_committee_id::text detail,
         array_agg(distinct candidate_id order by candidate_id) ids
  from candidate_committees where active = true
  group by fec_committee_id having count(distinct candidate_id) > 1
),
namestate as (
  select 'name_state'::text kind, (tk || ' / ' || coalesce(state,'?')) detail, ids
  from (
    select array_to_string((select array_agg(t order by t) from unnest(string_to_array(
             lower(regexp_replace(replace(name,',',' '),'\s+',' ','g')),' ')) t where t <> ''),' ') tk,
           state, array_agg(id order by id) ids
    from candidates group by 1,2 having count(*) > 1
  ) z
),
clusters as (select * from shared union all select * from namestate),
report as (
  select c.kind, c.detail, c.ids,
    coalesce((select string_agg(distinct m.status, ',')
       from candidate_merge_map m
       where m.canonical_id = any(c.ids) and m.dup_id = any(c.ids)), 'NONE') as triage
  from clusters c
)
SQL

# Counts drive the exit code.
read -r UNTRIAGED TRIAGED <<<"$(psql "$SUPABASE_DB_URL" -X -tA -F ' ' -c "
${DUPE_CTE}
select count(*) filter (where triage='NONE'),
       count(*) filter (where triage<>'NONE')
from report;")"
UNTRIAGED=${UNTRIAGED:-0}; TRIAGED=${TRIAGED:-0}

if [ "$UNTRIAGED" -eq 0 ] && [ "$TRIAGED" -eq 0 ]; then
  echo "[dupe-check] OK — no duplicate candidate clusters."
  exit 0
fi

if [ "$UNTRIAGED" -gt 0 ]; then
  echo "[dupe-check] ERROR — $UNTRIAGED untriaged duplicate cluster(s):"
  psql "$SUPABASE_DB_URL" -X -A -F ' | ' --pset footer=off -c "
${DUPE_CTE}
select '  - [' || kind || '] ' || detail as \"\",
       (select string_agg(name || ' {' || id || ', ' || coalesce(office,'?') || '}', '  vs  ' order by id)
          from candidates where id = any(report.ids)) as members
from report where triage='NONE' order by kind, detail;"
  echo "    Fix: triage each in candidate_merge_map (merge via merge_candidate, or status='rejected' if distinct)."
fi

if [ "$TRIAGED" -gt 0 ]; then
  echo "[dupe-check] note — $TRIAGED cluster(s) already in the review queue (proposed/rejected); not a failure:"
  psql "$SUPABASE_DB_URL" -X -A -F ' | ' --pset footer=off -c "
${DUPE_CTE}
select '  - [' || kind || '] ' || detail || ' (' || triage || ')' as \"\"
from report where triage<>'NONE' order by kind, detail;"
fi

[ "$UNTRIAGED" -gt 0 ] && exit 1 || exit 0
