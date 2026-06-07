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

## What it loads

| Source | → Target | Notes |
|---|---|---|
| `ccl` | `public.candidate_committees` | matched subset only (FK-safe); expands committee coverage for tracked candidates |
| `indiv` | `public.contributions` + `public.donors` | filtered to tracked committees; identity hashing matches the app's importer so rows dedupe |
| `pas2` | `public.contributions` + `public.donors` | PAC→candidate money to tracked candidates |
| `oth`, `oppexp` | `fec_stage.*` only | staged (filtered) for future use — **no app target table today** (operating expenditures / committee-to-committee have no home yet) |
| `cn`, `cm`, `weball`, `webl` | — | not loaded (already API-sourced / no target). Stage manually if needed. |

Everything is **idempotent**: re-running skips existing rows (`ON CONFLICT DO NOTHING`
on `contributions(identity_hash,cycle)` and `candidate_committees(candidate_id,fec_committee_id)`).

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
1. load `ccl` and run the linkage enrichment (so the relevant-committee set is current),
2. export the tracked committee/candidate IDs to temp files,
3. `awk`-filter `indiv`/`pas2`/`oth`/`oppexp` to only matching rows and `\copy` them into `fec_stage`,
4. run `03_transform.sql` (cycle-parameterized) to populate `contributions`/`donors`,
5. print before/after row counts.

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
