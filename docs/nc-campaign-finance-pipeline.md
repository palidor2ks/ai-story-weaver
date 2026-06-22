# NC Campaign Finance Pipeline — Design Doc

> Status: **DESIGN PHASE** (no code yet). Authored 2026-06-22.
> Decision gate: palidor2ks reviews this doc and approves schema + probe approach
> before any migration or edge function is written.

---

## 1. Goal

Surface NC state-legislator campaign finance on candidate profiles, on the same
card as federal (FEC) data and the TX / NJ / FL cards. All 170 NC General Assembly
seats are on the ballot in November 2026 — finance is the third pillar of the NC
beachhead (after votes + positions). The `strategy-nc-beachhead.md` doc classifies
this as enrichment ("not load-bearing for v0"), so it ships AFTER bills/votes, but
the design should be ready to execute once that foundation is in.

**Hard requirements** (from `state-campaign-finance.md`): fully automated,
no manual downloads, visible in-app alongside FEC data.

---

## 2. Source — NC State Board of Elections (NCSBE)

### 2.1 What we know

The NCSBE Campaign Finance division (`www.ncsbe.gov/campaign-finance`) is the
authoritative disclosure portal for NC state campaigns. Key known facts:

- **Coverage**: all NC candidates, including all 120 NC House and 50 NC Senate
  legislators (170 people, all on the 2026 ballot).
- **Bulk data downloads exist**: NCSBE publishes downloadable campaign finance data
  files (CSV), typically organized by cycle. The download page is at:
  `https://www.ncsbe.gov/campaign-finance/data-download`.
- **Filer ID**: NCSBE uses an "SBOE ID" (State Board of Elections ID) as the stable
  identifier per committee/candidate — the join key for contributions.
- **Filing cadence**: NC uses quarterly filing periods (with pre-election reports).
  Unlike TX's one-big-ZIP model, NCSBE files may be organized per cycle-year or
  per filing period.
- **Name format**: likely `"First Last"` or `"LastName, FirstName"` — needs probing.
  NCSBE may use the candidate's legal name in the filings vs. the common name in
  OpenStates / civic-officials. This is the critical matching variable.
- **Office codes**: NC uses its own codes (e.g., `HOU` or `SL` for state legislature
  house/senate vs. statewide offices). Exact values need probing.

### 2.2 Ingest shape — two likely candidates (probe to confirm)

**Option A — Bulk CSV download (preferred, mirrors TX approach)**
NCSBE may publish one CSV per cycle (contributions + filers) at a stable URL.
If so, the edge function Range-reads or direct-downloads the CSV per cycle, upserts
by SBOE ID + contribution PK. Fast, simple, idempotent.

**Option B — Per-candidate API / search endpoint (fallback, mirrors NJ/FL)**
NCSBE has a CFSearch web app. If bulk CSVs are not available or are poorly
structured, we enumerate legislative candidates via discover, then hit the search
endpoint per filer. More HTTP calls but the same discover/drain pattern.

The correct option is determined by the probe task (§8.1). TX taught us the
widely-cited URL can be stale (the TEC CDN vs the old `ethics.state.tx.us` URL) —
verify the real live URL, not just the one in the FAQ.

### 2.3 What we do NOT know yet (probe-gated)

| Question | Why it matters | Probe action |
|---|---|---|
| Bulk CSV URL(s) and their structure | Determines Option A vs B | `http_get` probe via DB extension |
| Filer CSV field names (SBOE ID, name, office, district) | Schema design | Inspect headers of filers/candidates file |
| Contribution CSV field names (PK, filer join, amount, date, contributor) | Schema design + idempotency key | Inspect headers of contributions file |
| Stable contribution PK | Required for idempotent upsert (like TEC's `contributionInfoId`) | Check if NCSBE assigns a row ID |
| Name format in NCSBE data (`"First Last"` vs `"Last, First"`) | Matching RPC strategy | Parse a few rows from the filers file |
| Office codes for NC House vs NC Senate | RPC filter clause | Inspect filers file office column |
| Cycle/year file naming convention | Discovery step | Check the download index |
| HTTP access from edge runtime | Required before choosing Option A/B | Probe with a `fetch` call from a test edge function |

---

## 3. Schema Design

Mirrors `tx_cf_*` exactly. Three tables + a run log. **No `shard_progress` table
until the probe confirms a bulk-ZIP / multi-shard model** (if it's a single CSV
per cycle, the progress table is just the sync-runs log).

```sql
-- supabase/migrations/YYYYMMDD_nc_cf_state_finance_schema.sql

-- nc_cf_filers: one row per NCSBE campaign committee/candidate account
create table if not exists public.nc_cf_filers (
  sboe_id           text primary key,      -- NCSBE SBOE ID (stable filer identifier)
  filer_name        text not null,         -- name as NCSBE stores it (e.g. "SMITH, JOHN")
  candidate_name    text,                  -- human-readable if different from filer_name
  office_cd         text,                  -- NCSBE office code (e.g. 'SL' for state leg)
  office_type       text,                  -- 'NC Senate' | 'NC House of Representatives'
  district          text,                  -- district number (text, e.g. '13')
  party_cd          text,                  -- party code
  election_year     int,                   -- election cycle year
  raw               jsonb,                 -- full source record for fidelity
  first_seen_at     timestamptz not null default now(),
  last_synced_at    timestamptz not null default now()
);

create index if not exists idx_nc_cf_filers_office
  on public.nc_cf_filers (office_cd, district);

-- nc_cf_contributions: one row per disclosed contribution
create table if not exists public.nc_cf_contributions (
  -- PK depends on whether NCSBE provides a stable row ID.
  -- Option 1: use NCSBE's own numeric ID (preferred — copy TEC pattern).
  -- Option 2: deterministic hash of (sboe_id, date, amount, contributor_name, line_num).
  contribution_id           text primary key,   -- NCSBE row ID or deterministic hash
  sboe_id                   text not null,      -- join to nc_cf_filers (no hard FK)
  filer_name                text,               -- denormalized for resilience
  contribution_dt           date,               -- contribution date
  contribution_amount       numeric,            -- amount in USD
  contributor_type          text,               -- INDIVIDUAL | BUSINESS | OTHER
  contributor_name          text,               -- individual full name or org name
  contributor_city          text,
  contributor_state         text,
  election_year             int,                -- from the filing period context
  source_file               text,               -- cycle file this row came from
  raw                       jsonb,
  synced_at                 timestamptz not null default now()
);

create index if not exists idx_nc_cf_contrib_sboe   on public.nc_cf_contributions (sboe_id);
create index if not exists idx_nc_cf_contrib_date   on public.nc_cf_contributions (contribution_dt);

-- nc_cf_sync_runs: run log
create table if not exists public.nc_cf_sync_runs (
  id                     bigint generated always as identity primary key,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running',
  mode                   text,                  -- discover | drain | full
  cycle_year             int,
  filers_upserted        int default 0,
  contributions_upserted int default 0,
  error                  text,
  notes                  jsonb
);

-- RLS: public read, service_role writes
alter table public.nc_cf_filers          enable row level security;
alter table public.nc_cf_contributions   enable row level security;
alter table public.nc_cf_sync_runs        enable row level security;

create policy nc_cf_filers_read         on public.nc_cf_filers         for select using (true);
create policy nc_cf_contributions_read  on public.nc_cf_contributions   for select using (true);
-- nc_cf_sync_runs: no public policy → internal/service_role only
```

**Note**: If the probe reveals a multi-file / per-filing-period structure (like TX
shards), add `nc_cf_shard_progress` modeled exactly after `tx_cf_shard_progress`.

---

## 4. Edge Function Design

**`supabase/functions/fetch-nc-finance/index.ts`**

Same locked-down pattern as NJ/FL/TX: shared-secret auth via
`check_nc_sync_secret` RPC comparing a caller-supplied token against a Vault secret.

### Modes

```
{ mode: "discover" }   → enumerate NC legislative filers, upsert nc_cf_filers
{ mode: "drain" }      → fetch contributions for un-synced filers, upsert nc_cf_contributions
{ mode: "full" }       → discover + drain in sequence
```

### discover

If **Option A (bulk CSV)**: download/range-read the filers CSV for the current
cycle, filter to NC House and NC Senate office codes, upsert into `nc_cf_filers`.
If **Option B (search API)**: paginate the CFSearch endpoint filtering by office
type, upsert into `nc_cf_filers`.

Target: ~170–300 filers (some legislators file under multiple committees or cycles).

### drain

Time-budgeted to ~110s (Deno's edge function limit is 150s; leave headroom for
upserts). For each filer in `nc_cf_filers` that hasn't been synced in the current
cycle (or ever), fetch contributions and upsert into `nc_cf_contributions`. Stamp
`last_synced_at` on the filer row when done. Cron resumes across runs.

Idempotency: upsert on `contribution_id` (stable NCSBE PK or deterministic hash).

### Rate limiting / etiquette

NCSBE is a government site. Respect it: add a 250ms sleep between per-filer
requests in Option B. In Option A (bulk download), one request per cycle-year is
already polite.

---

## 5. Matching RPC Design

**`nc_legislator_finance(p_name text, p_district text, p_office text) returns jsonb`**

Returns `{ matched_entities, total_raised, contribution_count, election_years, top_contributors }` —
same contract as `nj_legislator_finance` and `tx_legislator_finance`.

### Matching strategy (pending name-format probe)

The hard part is bridging our civic-officials names (`"John Smith"`, `"Mary Jones"`)
to NCSBE filer names (format TBD). Two strategies, pick after probe:

**If NCSBE stores `"First Last"` (or close enough):**
Use the TX approach — token-match on both first and last name tokens, unaccented,
within NC legislative office codes. Require ≥2 significant tokens.

**If NCSBE stores `"Last, First"` (or `"SMITH, JOHN M"` style):**
Use the NJ approach — match on district + chamber + surname substring (text before
the comma, letters-only). This avoids nickname failures (`"Joe"` vs `"JOSEPH"`).

Either way:
- Filter to NC state legislature offices only (exclude statewide, local, federal).
- Accept district as soft guidance (legislators can switch districts; name + chamber
  is the safe primary key, as in TX).
- Gate on ≥2 name tokens before matching (collision guard).
- Return `total_raised = 0` / empty for unmatched officials (section hides per UI).

### Name normalization

Apply `unaccent` on both sides (like TX). NC names are less accented than TX's
Latin-heritage names but cheap to handle universally. Strip `JR`, `SR`, `II–IV`,
`HON`, `THE HONORABLE` tokens before matching.

### Only regular filings (avoid double-count)

Mirroring TX's `source_file like 'contribs_%'` filter: once we understand the NC
filing calendar, exclude any "carry-over" or "amended" summary rows that re-state
amounts from prior reports. NC quarterly reports may have similar carry-over entries.
Probe the actual data before deciding — this may not apply if NCSBE deduplicates
at source.

---

## 6. UI Integration

Reuses the exact pattern from TX/NJ/FL. Four files to add:

| File | What it does |
|---|---|
| `src/hooks/useNcLegislatorFinance.ts` | React Query → `nc_legislator_finance` RPC |
| `src/components/NcStateFinanceSection.tsx` | Renders the finance card; hides when `total_raised <= 0` |
| Gate logic in `src/pages/CandidateProfile.tsx` | `isNcStateLegislator({ state, office, level })` gate — true only for NC state leg, excludes federal |
| RPC type cast | RPC won't be in generated types; cast `supabase.rpc as unknown as ...` like NJ/TX |

The gate hook pattern (from existing TX/NJ implementations):
```typescript
function isNcStateLegislator({ state, office, level }: { state?: string; office?: string; level?: string }) {
  if (level === "federal") return false;
  if (state !== "NC") return false;
  const o = (office ?? "").toLowerCase();
  return o.includes("house") || o.includes("senate") || o.includes("representative");
}
```

---

## 7. Cron Schedule

Two pg_cron jobs (same pattern as NJ):
- `nc-drain` — frequent (e.g., `*/5 * * * *`) to chew the backlog during initial
  load; throttle to `*/30 * * * *` once current.
- `nc-discover` — weekly (e.g., `0 6 * * 1`) to pick up newly filed committees.

Auth: same Vault-stored publishable-key + sync-secret pattern as NJ/TX.

---

## 8. Probe Plan (must happen BEFORE schema migration)

### 8.1 What to probe and how

The TX recon showed the agent sandbox blocks outbound HTTP to external hosts.
Use **the DB as an HTTP proxy** (same technique as FL/TX recon):

```sql
-- Re-enable http extension on ornnzinjrcyigazecctf for the probe, drop after
create extension if not exists http with schema extensions;

-- 1. Check if the data-download index is accessible and what's there
select status, content_type, content::text
from http_get('https://www.ncsbe.gov/campaign-finance/data-download');

-- 2. Try the likely bulk-data URL (adjust based on #1)
select status, headers, left(content::text, 2000) as preview
from http_get('https://www.ncsbe.gov/bulk-data/campaign-finance/<current-year>/...');

-- 3. Check a filer/candidate file headers
select status, left(content::text, 500)
from http_get('<filers-csv-url>');

-- 4. Check a contributions file headers
select status, left(content::text, 500)
from http_get('<contributions-csv-url>');

drop extension if exists http;
```

**Alternatively**: deploy a throwaway `nc-cf-probe` edge function (mirrors what was
done for TX with `tx-cf-probe`) if the DB proxy can't reach the NCSBE origin.
Delete the probe immediately after — as owed for `tx-cf-probe` and `nc-cf-probe`.

### 8.2 Decision point after probe

| Probe result | Decision |
|---|---|
| Bulk CSV(s) at stable URL, reasonable size (<500 MB) | Option A — direct download per cycle |
| Bulk CSV but huge (multi-GB) + Range-reads supported | Option A — HTTP Range streaming, like TX |
| No bulk CSV, only search API | Option B — per-filer scrape, like NJ/FL |
| Origin blocks non-browser UAs | Option B via DB-proxy or custom UA header |
| Name stored as `"First Last"` | TX-style token match |
| Name stored as `"Last, First"` | NJ-style district + surname match |

### 8.3 Contribution PK — critical for idempotency

Probe whether NCSBE assigns a stable numeric ID per contribution row. If yes,
use it as `contribution_id`. If not, use a deterministic hash:
`md5(sboe_id || '|' || contribution_dt || '|' || amount || '|' || contributor_name || '|' || line_num)`.
The TX approach (`contributionInfoId` — stable) is strongly preferred; the FL
approach (hash because CGI has no ID) works but hash collisions are a latent risk
on exact-duplicate rows.

---

## 9. Open Questions

1. **Filing periods vs. cycle years**: does NCSBE organize files per filing period
   (quarterly) or per election cycle? If quarterly, we may need a period-enumerate
   step in discover (like FL's election-by-election approach).

2. **Multiple committees per candidate**: a NC legislator may have more than one
   campaign committee (e.g., a general-election PAC + a principal campaign
   committee). The `matched_entities` array in the RPC output handles this (same
   as TX), but the discover step must not arbitrarily filter to one.

3. **Carry-over / amended rows**: NC quarterly reports may include carry-over
   balance lines that re-state the prior period's total. These inflate `total_raised`
   if summed naively. Needs inspection of actual contribution rows before the RPC
   aggregation query is finalized.

4. **Election year in scope**: NC legislators are elected on 2-year cycles. The
   2026 general is the primary target. Do we also load 2024 and 2022 data?
   Recommendation: load all available history (NCSBE likely provides going back
   several cycles) — the `election_years` field in the RPC output lets the UI show
   this meaningfully.

5. **Probe timing**: the `nc-cf-probe` edge function noted in HANDOFF.md was already
   created but neutered. If it still exists in the Supabase dashboard, it should be
   deleted (or reactivated for this probe, then deleted again). Verify before
   creating a new one.

---

## 10. Build Sequence (approved path after probe)

1. **Probe** (§8) → fill in the unknowns above.
2. **Migration**: `nc_cf_filers`, `nc_cf_contributions`, `nc_cf_sync_runs` tables +
   RLS. Add `nc_cf_shard_progress` only if needed. Run through `migration-safety-reviewer`.
3. **Secret RPC**: `check_nc_sync_secret` migration (mirrors `check_tx_sync_secret`).
4. **Edge function**: `fetch-nc-finance` with discover + drain. Gate through
   `etl-pipeline-reviewer`.
5. **Cron migration**: `nc-drain` + `nc-discover` pg_cron jobs. Gate through
   `observability-cron-reviewer`. **Do not enable without review** (CLAUDE.md guardrail #2).
6. **RPC migration**: `nc_legislator_finance(p_name, p_district, p_office)`. Gate
   through `data-accuracy-verifier` once data loads.
7. **UI**: `useNcLegislatorFinance`, `NcStateFinanceSection`, gate in
   `CandidateProfile.tsx`. Gate through `frontend-reviewer`.
8. **Verify end-to-end**: pick 3 known NC legislators, confirm totals match NCSBE.
   Record in `docs/DATA-ACCURACY.md`.

Estimated scope: similar to FL (smaller than TX's bulk-ZIP complexity). The build
sequence is 3–4 PRs: schema, edge-fn, RPC, UI.

---

## 11. Relationship to the NC Strategy

Per `strategy-nc-beachhead.md`, Task order is:
1. PoliScore methodology + validate (current focus)
2. NC General Assembly roster + bills/votes (next)
3. Compute scores + public pages
4. Voter loop
5. Distribution

**NC campaign finance is enrichment** — it ships after Task 3 is live, as the
"full profile" layer that makes legislators more searchable and the data more
credible. It does NOT gate the initial PoliScore launch.

When it ships, it will be the only publicly accessible aggregation of NC state
legislative finance data alongside a voter-alignment score — a meaningful data moat.

---

*Design ready for probe + palidor2ks approval. No code written.*
