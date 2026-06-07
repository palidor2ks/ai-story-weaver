#!/usr/bin/env bash
# Filtered FEC bulk loader for one cycle. Idempotent: re-running a cycle refreshes it.
#   scripts/fec-etl/run.sh <dir-with-cycle-zips> <cycle> [--count-only]
# Requires: SUPABASE_DB_URL (session pooler), psql, unzip, awk.
#
# Big transaction files (indiv/pas2/oth/oppexp) are streamed through awk and only
# rows tied to tracked committees/candidates are loaded. Reference/summary files
# (ccl/cm/cn/weball) are small and loaded in full. See README.md for the mapping.
set -euo pipefail

DIR="${1:?usage: run.sh <dir> <cycle> [--count-only]}"
CYCLE="${2:?usage: run.sh <dir> <cycle> [--count-only]}"
COUNT_ONLY="${3:-}"
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL to the session-pooler URI}"
YY="${CYCLE:2:2}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
psql() { command psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
COPYOPT="(format csv, delimiter '|', quote E'\x01', encoding 'LATIN1')"

resolve_txt() {                      # echo path to the .txt for a prefix (unzip if needed)
  local prefix="$1" zip
  zip=$(ls "$DIR/${prefix}${YY}"*.zip 2>/dev/null | head -1 || true)
  if [[ -n "$zip" ]]; then
    unzip -o -j -q "$zip" -d "$WORK/$prefix"; ls "$WORK/$prefix"/*.txt | head -1
  else
    ls "$DIR/${prefix}"*.txt 2>/dev/null | head -1 || true
  fi
}
load_full() {                        # truncate + \copy a small reference file
  local prefix="$1" table="$2" f; f=$(resolve_txt "$prefix")
  [[ -z "$f" ]] && { echo "!! missing $prefix, skipping"; return; }
  echo "-- load $table ($(wc -l < "$f") rows)"
  psql -c "truncate fec_stage.$table;" -c "\copy fec_stage.$table from '$f' with $COPYOPT"
}
load_filtered() {                    # awk-filter a big file then \copy (header rows drop out naturally)
  local prefix="$1" table="$2" awkprog="$3" f out; f=$(resolve_txt "$prefix")
  [[ -z "$f" ]] && { echo "!! missing $prefix, skipping"; return; }
  out="$WORK/${prefix}_f.txt"
  awk -F'|' "$awkprog" "$WORK/cmtes.txt" "$WORK/cands.txt" "$f" > "$out"
  echo "-- $prefix: $(wc -l < "$f") -> $(wc -l < "$out") relevant rows"
  psql -c "truncate fec_stage.$table;" -c "\copy fec_stage.$table from '$out' with $COPYOPT"
}

echo "== cycle $CYCLE  dir $DIR  ${COUNT_ONLY:+(count-only)} =="

# 1) Reference files (full) ----------------------------------------------------
load_full ccl ccl
load_full cm  cm
load_full cn  cn
load_full weball weball

# 2) Enrich candidate_committees from ccl + load reference targets --------------
if [[ "$COUNT_ONLY" != "--count-only" ]]; then
  psql -v cycle="$CYCLE" -f "$HERE/02_ccl_enrich.sql"
  psql -v cycle="$CYCLE" -f "$HERE/04_reference.sql"
fi

# 3) Tracked id sets for filtering --------------------------------------------
psql -At -c "select distinct fec_committee_id from public.candidate_committees where fec_committee_id is not null" > "$WORK/cmtes.txt"
psql -At -c "select id from public.candidates" > "$WORK/cands.txt"
echo "-- tracked: $(wc -l < "$WORK/cmtes.txt") committees, $(wc -l < "$WORK/cands.txt") candidates"

# 4) Big transaction files (awk-filtered) -------------------------------------
# ARGV[1]=cmtes, ARGV[2]=cands, ARGV[3]=data
load_filtered indiv indiv '
  FNR==NR&&FILENAME==ARGV[1]{cm[$1]=1;next} FILENAME==ARGV[2]{cn[$1]=1;next} ($1 in cm)'
load_filtered pas2 pas2 '
  FNR==NR&&FILENAME==ARGV[1]{cm[$1]=1;next} FILENAME==ARGV[2]{cn[$1]=1;next} ($16 in cm)||($17 in cn)'
load_filtered oth oth '
  FNR==NR&&FILENAME==ARGV[1]{cm[$1]=1;next} FILENAME==ARGV[2]{cn[$1]=1;next} ($1 in cm)||($16 in cm)'
load_filtered oppexp oppexp '
  FNR==NR&&FILENAME==ARGV[1]{cm[$1]=1;next} FILENAME==ARGV[2]{cn[$1]=1;next} ($1 in cm)'

# 5) Transforms ----------------------------------------------------------------
if [[ "$COUNT_ONLY" == "--count-only" ]]; then
  echo "-- count-only: staged rows that would transform:"
  psql -c "select 'indiv' src,count(*) from fec_stage.indiv union all select 'pas2',count(*) from fec_stage.pas2 union all select 'oth',count(*) from fec_stage.oth union all select 'oppexp',count(*) from fec_stage.oppexp;"
else
  psql -v cycle="$CYCLE" -f "$HERE/03_transform.sql"     # indiv/pas2 -> contributions + donors
  psql -v cycle="$CYCLE" -f "$HERE/05_transactions.sql"  # oth -> fec_committee_transactions, oppexp -> fec_operating_expenditures
fi
echo "== done =="
