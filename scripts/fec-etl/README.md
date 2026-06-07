# FEC bulk-data ETL (filtered, server-side)

Loads the FEC **bulk data** files you placed in Drive's `Pulse` folder into this
app's Postgres, **filtered to only the committees/candidates the app tracks** so
the national firehose (tens of millions of rows) never bloats the database.

You run this **locally** (the files are far too large to pull through the chat
connector). It talks to the database over the **session-pooler** connection
string.

---

## Why this exists

The bulk files are the *entire national* FEC dataset:

| File (per cycle) | FEC type | Rows (national) | Uncompressed |
|---|---|---|---|
| `indiv` (`itcont.txt`) | individual contributions | ~25–40 M | ~30 GB+ |
| `pas2` (`itpas2.txt`) | committee → candidate $ | ~0.4 M | ~300 MB |
| `oth`  (`itoth.txt`)   | committee → committee $ | ~3 M | ~2 GB |
| `oppexp` (`oppexp.txt`)| operating expenditures | ~5 M | ~3 GB |
| `cn` / `cm` / `ccl` / `weball` / `webl` | candidate/committee master, linkage, summaries | small | small |

This app tracks **~963 candidates**, so it only needs the slice of money tied to
**their** committees. We get that slice by `awk`-filtering each big file against
the set of committee IDs in `candidate_committees` *before* loading.

## What it loads — every file has a home

| Source | → Target | New table? | Notes |
|---|---|---|---|
| `cm` committee master | `public.external_pacs` | reuse | upsert on `fec_committee_id`; merges `cycles[]` |
| `cn` candidate master | `public.fec_candidates` | **new** | upsert on `(fec_candidate_id, cycle)` |
| `ccl` linkage | `public.candidate_committees` | reuse | matched subset only (FK-safe); expands committee coverage |
| `weball`/`webl` $ summary | `public.external_committee_finance` | reuse | keyed by principal committee + cycle; `webl` ⊂ `weball`, load `weball` |
| `weball` (also) | `finance_reconciliation` + `committee_finance_rollups` | reuse | **UPDATE existing rows only** — feeds the FEC side of the app's reconciliation |
| `indiv` donations | `public.contributions` + `public.donors` | reuse | filtered; identity hashing matches the importer so rows dedupe vs existing data |
| `pas2` PAC→candidate | `public.contributions` + `public.donors` | reuse | filtered to tracked recipients/candidates |
| `oth` committee→committee | `public.fec_committee_transactions` | **new** | filtered to tracked committees |
| `oppexp` operating expenses | `public.fec_operating_expenditures` | **new** | filtered; total rolled into `external_committee_finance.operating_expenses` |

New tables are created by migration `supabase/migrations/20260607050000_fec_bulk_target_tables.sql`
(already applied to the dev project). **Left untouched** (app-maintained): `candidate_fec_ids`,
`independent_expenditures`, and row *creation* in `finance_reconciliation`/`committee_finance_rollups`.

### Idempotent + re-runnable (for 2026 re-uploads)
Re-running a cycle **refreshes** it cleanly:
- reference/summary tables upsert on their natural key + cycle (re-upload updates values);
- `contributions` deletes only this cycle's bulk-loaded rows (`import_session_id='fec-bulk-<cycle>'`)
  then reloads — **API rows and other cycles are never touched**; `donors` are recomputed;
- `oth`/`oppexp` delete-then-insert per cycle.

---

## Prerequisites

1. **Unzip the files** from `Pulse` into one directory, per cycle. Expected inner
   names (FEC standard): `itcont.txt`, `itpas2.txt`, `itoth.txt`, `oppexp.txt`,
   `ccl.txt`. `run.sh` auto-detects the `.txt` inside each `*.zip` if you point it
   at the zips.
2. **`psql`** installed (v14+), and **`awk`**, **`unzip`**.
3. **`SUPABASE_DB_URL`** — the **session pooler** URI (port 5432, *not* 6543).
   See `docs/dev-migration-resync.md`. Export it:
   ```bash
   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres'
   ```

## Run

```bash
# 1) one-time: create staging schema
psql "$SUPABASE_DB_URL" -f scripts/fec-etl/01_staging.sql

# 2) per cycle: filter + load + transform
#    args: <dir with the cycle's zips/txt> <cycle, e.g. 2024>
scripts/fec-etl/run.sh /path/to/fec/2024 2024
scripts/fec-etl/run.sh /path/to/fec/2026 2026
```

`run.sh` will, for that cycle:
1. load the reference files full (`ccl`, `cm`, `cn`, `weball`),
2. run `02_ccl_enrich.sql` (expand `candidate_committees`) and `04_reference.sql`
   (`cm`→`external_pacs`, `cn`→`fec_candidates`, `weball`→`external_committee_finance` + reconciliation),
3. export the tracked committee/candidate IDs,
4. `awk`-filter `indiv`/`pas2`/`oth`/`oppexp` to matching rows and `\copy` into `fec_stage`,
5. run `03_transform.sql` (`indiv`/`pas2`→`contributions`/`donors`) and
   `05_transactions.sql` (`oth`→`fec_committee_transactions`, `oppexp`→`fec_operating_expenditures`),
6. print row counts.

SQL files: `01_staging.sql` (once) · `02_ccl_enrich.sql` · `03_transform.sql` ·
`04_reference.sql` · `05_transactions.sql` — all cycle-parameterized via `-v cycle=YYYY`.

## Safety

- **Dry-run first:** `run.sh ... --count-only` filters and loads to staging and
  prints how many rows *would* transform, without writing to `contributions`/`donors`.
- Staging lives in its own `fec_stage` schema and is truncated per cycle.
- Nothing here is destructive to existing data — inserts only, conflicts skipped.

## Verify after a run

```sql
select cycle, count(*) from public.contributions group by cycle order by cycle;
select count(*) from public.candidate_committees;     -- should grow after ccl
```
