#!/usr/bin/env bash
# Filtered FEC bulk loader for one cycle.
#   scripts/fec-etl/run.sh <dir-with-cycle-zips> <cycle> [--count-only]
# Requires: SUPABASE_DB_URL (session pooler), psql, unzip, awk.
#
# Streams each giant FEC file through awk, keeping only rows tied to committees/
# candidates the app tracks, then \copy's the (small) result into fec_stage and
# runs the transforms. The national firehose never lands in the database.
set -euo pipefail

DIR="${1:?usage: run.sh <dir> <cycle> [--count-only]}"
CYCLE="${2:?usage: run.sh <dir> <cycle> [--count-only]}"
COUNT_ONLY="${3:-}"
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL to the session-pooler URI}"
YY="${CYCLE:2:2}"                       # 2024 -> 24
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
psql() { command psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
COPYOPT="(format csv, delimiter '|', quote E'\x01', encoding 'LATIN1')"

# Resolve the inner .txt for a given prefix (unzip if needed), echo its path.
resolve_txt() {
  local prefix="$1" zip txt
  zip=$(ls "$DIR/${prefix}${YY}"*.zip 2>/dev/null | head -1 || true)
  if [[ -n "$zip" ]]; then
    unzip -o -j -q "$zip" -d "$WORK/$prefix"
    ls "$WORK/$prefix"/*.txt | head -1
  else
    ls "$DIR/${prefix}"*.txt 2>/dev/null | head -1 || true
  fi
}

echo "== cycle $CYCLE  dir $DIR  ${COUNT_ONLY:+(count-only)} =="

# 1) Reference: load ccl + cm full, then enrich candidate_committees -----------
for t in ccl cm; do
  f=$(resolve_txt "$t"); [[ -z "$f" ]] && { echo "!! missing $t file, skipping"; continue; }
  echo "-- load $t  ($(wc -l < "$f") rows)"
  psql -c "truncate fec_stage.$t;" -c "\copy fec_stage.$t from '$f' with $COPYOPT"
done

if [[ "$COUNT_ONLY" != "--count-only" ]]; then
  echo "-- enrich candidate_committees from ccl"
  psql -v cycle="$CYCLE" -f "$HERE/02_ccl_enrich.sql"
fi

# 2) Export the tracked committee / candidate id sets for awk filtering --------
psql -At -c "select distinct fec_committee_id from public.candidate_committees where fec_committee_id is not null" > "$WORK/cmtes.txt"
psql -At -c "select id from public.candidates" > "$WORK/cands.txt"
echo "-- tracked: $(wc -l < "$WORK/cmtes.txt") committees, $(wc -l < "$WORK/cands.txt") candidates"

# 3) Filter + load the big transaction files ----------------------------------
# indiv: keep when recipient committee (col 1) is tracked.
load_filtered() {
  local prefix="$1" table="$2" awkprog="$3" f out
  f=$(resolve_txt "$prefix"); [[ -z "$f" ]] && { echo "!! missing $prefix file, skipping"; return; }
  out="$WORK/${prefix}_filtered.txt"
  awk -F'|' "$awkprog" "$WORK/cmtes.txt" "$WORK/cands.txt" "$f" > "$out"
  echo "-- $prefix: $(wc -l < "$f") -> $(wc -l < "$out") relevant rows"
  psql -c "truncate fec_stage.$table;" -c "\copy fec_stage.$table from '$out' with $COPYOPT"
}

# NR==FNR blocks build the lookup sets from the first two files (cmtes, cands).
load_filtered indiv indiv '
  FNR==NR && FILENAME==ARGV[1]{cm[$1]=1; next}
  FILENAME==ARGV[2]{cn[$1]=1; next}
  ($1 in cm)'
load_filtered pas2 pas2 '
  FNR==NR && FILENAME==ARGV[1]{cm[$1]=1; next}
  FILENAME==ARGV[2]{cn[$1]=1; next}
  ($16 in cm) || ($17 in cn)'
# oth staged (filtered) only — no app target yet.
load_filtered oth oth '
  FNR==NR && FILENAME==ARGV[1]{cm[$1]=1; next}
  FILENAME==ARGV[2]{cn[$1]=1; next}
  ($1 in cm) || ($16 in cm)'

# 4) Transform -----------------------------------------------------------------
if [[ "$COUNT_ONLY" == "--count-only" ]]; then
  echo "-- count-only: staged rows that would transform:"
  psql -c "select 'indiv' src, count(*) from fec_stage.indiv union all select 'pas2', count(*) from fec_stage.pas2;"
else
  echo "-- transform -> contributions + donors"
  psql -v cycle="$CYCLE" -f "$HERE/03_transform.sql"
fi
echo "== done =="
