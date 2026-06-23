# NC Campaign Finance Pipeline — Design Doc

> Status: **PROBE COMPLETE** (2026-06-22) — source format verified end-to-end via the
> DB `http`-proxy recon. No pipeline code written yet. Decision gate: palidor2ks
> reviews and approves the schema + edge-function plan below before the first migration.
>
> The probe (§8) resolved every open question from the original design. Findings are
> folded into §2–§5; the original two-option uncertainty is settled: **NCSBE is a
> per-committee search-API source (Option B), like NJ/FL — there is no bulk CSV.**

---

## 1. Goal

Surface NC state-legislator campaign finance on candidate profiles, on the same
card as federal (FEC) data and the TX / NJ / FL cards. All 170 NC General Assembly
seats are on the ballot in November 2026 — finance is the third pillar of the NC
beachhead (after votes + positions). The `strategy-nc-beachhead.md` doc classifies
this as enrichment ("not load-bearing for v0"), so it ships AFTER bills/votes, but
the design is ready to execute once that foundation is in.

**Hard requirements** (from `state-campaign-finance.md`): fully automated,
no manual downloads, visible in-app alongside FEC data.

---

## 2. Source — NC State Board of Elections (NCSBE) — VERIFIED

### 2.1 No bulk data — two search apps

NCSBE publishes **no bulk campaign-finance dump**. The S3 download bucket
(`s3.amazonaws.com/dl.ncsbe.gov`) holds only PDFs/manuals under `Campaign_Finance/`
and voter files under `data/` — confirmed by listing its prefixes. All transaction
data lives behind two ASP.NET MVC search apps on `cf.ncsbe.gov` (Inspinia template,
classic form POSTs — the **same shape as NJ ELEC**):

| App | URL | Role in our pipeline |
|---|---|---|
| **Campaign Document Search By Entity** | `https://cf.ncsbe.gov/CFOrgLkup/` | **discover** — find a candidate's committee(s) + SBoE ID |
| **Transaction Search By Entity** | `https://cf.ncsbe.gov/CFTxnLkup/` | **drain** — pull a committee's receipts as CSV |

> **Access note:** `www.ncsbe.gov` and `cf.ncsbe.gov` both **403 non-browser UAs**
> via `WebFetch`, but the DB `http` extension reaches them fine (used for this recon).
> The production edge function will use Deno `fetch` (as FL does behind Cloudflare) —
> confirm with a debug fetch on the first build, but the origin itself is reachable.
> Data **updates overnight each weeknight** (the footer stamps "Data current as of …").

### 2.2 discover — `/CFOrgLkup/` (committee lookup)

`POST https://cf.ncsbe.gov/CFOrgLkup/` form-encoded:

```
UseOrgName=false&UseCandName=true&UseInHouseName=false&UseAcronym=false&Name=<lastname>
```

The results page **embeds a JSON array inline** (`var data = [ ... ]`) — no second
request needed. Each committee object:

```json
{
  "OrgName":   "COMMITTEE TO ELECT RAY PICKETT (PICKETT, PHILLIP RAY, JR.)",
  "SBoEID":    "STA-Y0293T-C-001",
  "OldID":     null,
  "CandName":  "PHILLIP RAY PICKETT JR",
  "StatusDesc":"ACTIVE (NON-EXEMPT)",
  "OrgGroupID":42137,
  "Link":      null
}
```

- **`SBoEID`** — stable committee identifier (e.g. `STA-Y0293T-C-001`; county committees
  use a numeric prefix like `090-CAIRWN-C-001`). The filer PK.
- **`CandName`** — candidate name as **"FIRST [MIDDLE] LAST [SUFFIX]"** (e.g.
  `PHILLIP RAY PICKETT JR`). This is the match target — see §5.
- **`OrgName`** — committee name with the candidate in parens `(LAST, FIRST …)`.
- **`StatusDesc`** — ACTIVE / CLOSED, etc.
- **`OrgGroupID` / `OldID`** — internal ids (kept in `raw` for fidelity).

CFOrgLkup returns committees for **any** office matching the name — it has no office
filter — so discovery is **roster-driven**: for each NC legislator already in our
`candidates` table (seeded by beachhead Task 2), search by surname and keep the
committee(s) whose `CandName` token-matches the legislator (§5).

### 2.3 drain — `/CFTxnLkup/ExportResults/` (stateless CSV export)

The transaction grid loads via a **session-bound** JSON endpoint
(`/CFTxnLkup/GetPagedResults` — 500s without the session cookie set by a prior
`TxnSearchResults` POST, so **not** usable statelessly). But the **CSV export is
stateless** and is the drain mechanism:

`POST https://cf.ncsbe.gov/CFTxnLkup/ExportResults/` form-encoded, single field
`Params=<url-encoded JSON>`. Returns CSV directly (verified: 200 + CSV body). The
JSON criteria object (all fields required; load-bearing ones called out):

```json
{
  "ReceiptType":"'GEN ','OTLN','IND ','PPTY','CPCM','LOAN','RFND','INT ','NFPC','OUTS','GNS ','FRLN','CNRE','LEFO','EPPS','DEBT','DON ','BFND'",
  "ExpenditureType":"", "CommitteeType":"", "PartyType":"", "OfficeType":"",
  "CommitteeIDs":null,
  "CommitteeName":"COMMITTEE TO ELECT RAY PICKETT",
  "Cities":"","Counties":"","State":"","ZipCodes":"",
  "DateFrom":"01/01/2024","DateTo":"12/31/2024",
  "OrganizationName":"","FirstName":"","LastName":"",
  "NameSoundsLike":false,"NameIsOrg":false,
  "Purpose":"","AmountFrom":"","AmountTo":"",
  "JobProfession":"","JobProfSoundsLike":false,"Employer":"","EmployerSoundsLike":false,
  "PaymentType":"","Page":0,"Debug":false
}
```

**Verified filter behavior (this is the load-bearing part):**
- **`CommitteeName` (exact base name) filters correctly** — `COMMITTEE TO ELECT RAY
  PICKETT` returned exactly that committee's 80 receipts for 2024. ✅ **This is the
  drain key.** (The transaction CSV's "Committee Name" column is the base name without
  the `(LAST, FIRST)` parenthetical, so strip the parenthetical from the CFOrgLkup
  `OrgName` to build the filter — or match against the committee name as it appears
  in transactions.)
- **`OfficeType` is IGNORED by the export** — `NSHS`, `NCSN`, and empty all returned
  byte-identical output. ❌ Cannot drain by office. (Office codes still useful for
  reference: `NSHS` = N.C. House, `NCSN` = N.C. Senate.)
- **`CommitteeIDs` with the SBoE-ID string is NOT accepted** — returns an HTML page,
  not CSV. The field wants an internal numeric id (likely `OrgGroupID`); not worth
  chasing since `CommitteeName` works. (Build-time refinement: try `OrgGroupID` if
  name collisions appear.)
- `ReceiptType` is the quoted, comma-separated 4-char code list (codes padded to 4
  chars: note trailing spaces in `'GEN '`, `'IND '`, `'INT '`, `'GNS '`, `'DON '`).
- Dates are `mm/dd/yyyy`. A single committee's full history is one bounded POST
  (e.g. `01/01/2000`–today) — well under any practical size (Pickett's whole 2024 =
  ~19 KB). No pagination needed at the per-committee grain.

### 2.4 CSV output contract (24 columns — exact header)

```
Name, Street Line 1, Street Line 2, City, State, Zip Code, Profession/Job Title,
Employer's Name/Specific Field, Transction Type, Committee Name, Committee SBoE ID,
Committee Street 1, Committee Street 2, Committee City, Committee State,
Committee Zip Code, Report Name, Date Occured, Account Code, Amount,
Form of Payment, Purpose, Candidate/Referendum Name, Declaration
```

> Two header typos are **in the source** and must be matched verbatim by the parser:
> `Transction Type` (sic) and `Date Occured` (sic).

Per-row meaning (receipts):
- `Name` — contributor name ("First Last", or org name), or the literal
  **`Aggregated Individual Contribution`** for NC's unitemized small-donor aggregate
  (a real receipt, not a re-stated summary — keep it, but it has no address/employer).
- `Transction Type` — contributor class: `Individual`, `Non-Party Comm`, etc.
- `Committee Name` + `Committee SBoE ID` — the recipient (our join key).
- `Report Name` — e.g. `2024 First Quarter`, `2024 Second Quarter (Amendment)`.
  **Amendments are a dedup concern** (see §9.3).
- `Date Occured` — `mm/dd/yyyy`. `Amount` — decimal (e.g. `500.0000`).
- `Account Code`, `Form of Payment`, `Purpose`, `Candidate/Referendum Name`,
  `Declaration` — secondary, stored for fidelity.

**There is NO transaction-level id** in the output → idempotency requires a
deterministic hash (see §3 + §9.4).

---

## 3. Schema Design

Mirrors `tx_cf_*` (isolated `nc_cf_*` tables, RLS public-read). Field set updated to
the verified CSV/JSON contracts above.

```sql
-- supabase/migrations/YYYYMMDD_nc_cf_state_finance_schema.sql

-- nc_cf_filers: one row per NCSBE committee (from CFOrgLkup discover)
create table if not exists public.nc_cf_filers (
  sboe_id           text primary key,      -- SBoEID, e.g. 'STA-Y0293T-C-001'
  org_name          text not null,         -- OrgName (committee name w/ "(LAST, FIRST)")
  committee_name    text,                  -- base name used as the txn drain filter
  cand_name         text,                  -- CandName "FIRST MIDDLE LAST SUFFIX" (match target)
  status_desc       text,                  -- StatusDesc (ACTIVE / CLOSED / …)
  org_group_id      bigint,                -- OrgGroupID (internal)
  old_id            text,                  -- OldID (legacy)
  -- office/district are NOT in NCSBE's committee data; they come from our roster.
  -- Stored here when known (via the candidates match) to speed the RPC, else null.
  office_cd         text,                  -- 'NSHS' (N.C. House) | 'NCSN' (N.C. Senate)
  district          text,
  raw               jsonb,
  last_synced_at    timestamptz not null default now(),
  first_seen_at     timestamptz not null default now()
);

create index if not exists idx_nc_cf_filers_candname on public.nc_cf_filers using gin (cand_name gin_trgm_ops);

-- nc_cf_contributions: one row per disclosed receipt (from CFTxnLkup ExportResults CSV)
create table if not exists public.nc_cf_contributions (
  -- No source PK → deterministic hash of the dedup-significant fields (see §9.4).
  contribution_id        text primary key,
  sboe_id                text not null,     -- Committee SBoE ID (join to nc_cf_filers; no hard FK)
  committee_name         text,              -- denormalized
  contributor_name       text,             -- Name (or 'Aggregated Individual Contribution')
  contributor_type       text,             -- Transction Type (Individual | Non-Party Comm | …)
  contributor_city       text,
  contributor_state      text,
  contributor_zip        text,
  profession             text,             -- Profession/Job Title
  employer               text,             -- Employer's Name/Specific Field
  occur_date             date,             -- Date Occured
  amount                 numeric,          -- Amount
  account_code           text,             -- Account Code
  form_of_payment        text,
  purpose                text,
  report_name            text,             -- Report Name (period; flags amendments)
  is_amendment           boolean,          -- derived: Report Name contains '(Amendment)'
  related_committee_name text,             -- Candidate/Referendum Name
  declaration            text,
  raw                    jsonb,
  synced_at              timestamptz not null default now()
);

create index if not exists idx_nc_cf_contrib_sboe on public.nc_cf_contributions (sboe_id);
create index if not exists idx_nc_cf_contrib_date on public.nc_cf_contributions (occur_date);

-- nc_cf_sync_runs: run log
create table if not exists public.nc_cf_sync_runs (
  id                     bigint generated always as identity primary key,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running',  -- running | success | error
  mode                   text,                              -- discover | drain | full
  committees_upserted    int default 0,
  contributions_upserted int default 0,
  error                  text,
  notes                  jsonb
);

-- RLS: public read, service_role writes (bypasses RLS)
alter table public.nc_cf_filers          enable row level security;
alter table public.nc_cf_contributions   enable row level security;
alter table public.nc_cf_sync_runs        enable row level security;

create policy nc_cf_filers_read        on public.nc_cf_filers        for select using (true);
create policy nc_cf_contributions_read on public.nc_cf_contributions  for select using (true);
-- nc_cf_sync_runs: no public policy → internal/service_role only
```

No `nc_cf_shard_progress` table — the per-committee drain model has no shards; the
`nc_cf_filers.last_synced_at` cursor + the run log are enough to resume.

---

## 4. Edge Function Design

**`supabase/functions/fetch-nc-finance/index.ts`** — locked down with a shared secret
(`check_nc_sync_secret` RPC vs Vault), same as NJ/FL/TX.

### discover

For each NC legislator in `candidates` (`state = 'NC'`, office = NC House/Senate,
seeded by beachhead Task 2):
1. `POST /CFOrgLkup/` with `UseCandName=true&Name=<surname>`.
2. Parse the inline `var data = [ … ]` JSON array from the HTML
   (regex/extract between `var data = ` and `;`).
3. Keep committees whose `CandName` token-matches the legislator (§5 logic, applied
   here so we only store relevant committees).
4. Upsert into `nc_cf_filers` (sboe_id, org_name, committee_name = OrgName minus the
   `(…)` parenthetical, cand_name, status_desc, office_cd + district from the matched
   roster row, raw).

~170 legislators → a few hundred committees (many have a current + prior committee).
Time-budgeted ~110 s, resumable, polite (≥250 ms between requests to a gov site).

### drain

For each `nc_cf_filers` row not synced recently:
1. `POST /CFTxnLkup/ExportResults/` with `Params` JSON: `CommitteeName=<committee_name>`,
   full `ReceiptType` set, `DateFrom=01/01/2000`, `DateTo=<today>`.
2. Parse CSV (RFC-4180; the source quotes fields containing commas).
3. Compute `contribution_id` hash (§9.4), derive `is_amendment` from `Report Name`,
   upsert into `nc_cf_contributions`.
4. Stamp `nc_cf_filers.last_synced_at`.

Idempotent (hash PK) so cron resumes across runs and re-runs converge.

### full

`discover` then `drain` (convenience / first load).

---

## 5. Matching RPC

**`nc_legislator_finance(p_name text, p_district text, p_office text) returns jsonb`** —
same contract as `tx_legislator_finance` / `nj_legislator_finance`:
`{ matched_entities, total_raised, contribution_count, election_years, top_contributors }`.

**Name format is settled: `CandName` is "FIRST [MIDDLE] LAST [SUFFIX]"** → use the
**TX-style token match** (not NJ's "Last, First" surname match):
- Tokenize `p_name`, uppercase + `unaccent`, drop `JR/SR/II–IV/MR/MRS/MS/DR/HON`.
- Require ≥2 significant tokens (first + last) as a collision guard.
- Match a filer when **every** token appears in `unaccent(upper(cand_name))`.
- Restrict to legislative filers: `office_cd in ('NSHS','NCSN')` when populated, and/or
  gate `p_office` to state House/Senate (exclude federal — the FEC pipeline owns those).
- District is **soft** (name + chamber is the safe key, as in TX): legislators change
  districts; don't hard-filter on it.
- Aggregate `nc_cf_contributions` by the matched `sboe_id`(s); `total_raised`,
  `contribution_count`, `top_contributors` (group by contributor), `election_years`
  (distinct year from `occur_date`).
- **Exclude amendments from the sum** to avoid double-counting (§9.3): either sum only
  non-amendment rows, or dedup amended reports — decide against real data at build time.

Returns `total_raised = 0` / empty for unmatched officials → the UI section hides.

---

## 6. UI Integration

Reuses the TX/NJ/FL pattern exactly — four touch-points:

| File | What it does |
|---|---|
| `src/hooks/useNcLegislatorFinance.ts` | React Query → `nc_legislator_finance` RPC (cast `supabase.rpc as unknown as …`; RPC not in generated types) |
| `src/components/NcStateFinanceSection.tsx` | Renders the card; **hides when `total_raised <= 0`** |
| gate in `src/pages/CandidateProfile.tsx` | `isNcStateLegislator({ state, office, level })` — NC + state House/Senate only, excludes `level === 'federal'` |
| (mount) | `<NcStateFinanceSection …/>` before the Tabs, beside the FEC/TX/NJ/FL cards |

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

Two pg_cron jobs (Vault-auth publishable key + sync secret, like NJ/TX):
- `nc-drain` — frequent (`*/5 * * * *`) during initial load; throttle to hourly once current.
- `nc-discover` — weekly (`0 6 * * 1`) to pick up new committees.

NCSBE refreshes overnight each weeknight, so a nightly drain is sufficient at steady state.

---

## 8. Probe — DONE (2026-06-22)

Run via the DB `http` extension on `ornnzinjrcyigazecctf` (already enabled from prior
TX/FL recon; `cf.ncsbe.gov` 403s `WebFetch` but the DB proxy reaches it). Verified:

| Question | Answer |
|---|---|
| Bulk CSV? | **No.** S3 bucket has only PDFs + voter files. → Option B. |
| Source shape | Two ASP.NET MVC apps: `CFOrgLkup` (committees) + `CFTxnLkup` (transactions). |
| Discover endpoint | `POST /CFOrgLkup/` → inline `var data=[…]` JSON with SBoEID + CandName. |
| Drain endpoint | `POST /CFTxnLkup/ExportResults/` (`Params` JSON) → CSV, **stateless**. |
| Drain filter that works | **`CommitteeName`** (exact). `OfficeType` ignored; `CommitteeIDs`=SBoE-ID rejected. |
| Name format | `CandName` = "FIRST MIDDLE LAST SUFFIX" → TX-style token match. |
| Contribution PK | **None** → deterministic hash. |
| Committee key | **SBoE ID** (`STA-…-C-001` / `NNN-…-C-001`). |
| Office codes | `NSHS` = N.C. House, `NCSN` = N.C. Senate (reference only — not filterable in export). |
| Receipt codes | GEN, OTLN, IND, PPTY, CPCM, LOAN, RFND, INT, NFPC, OUTS, GNS, FRLN, CNRE, LEFO, EPPS, DEBT, DON, BFND. |
| Districts in source | **No** — come from our roster; match on name + chamber. |
| Freshness | Overnight each weeknight. |
| Edge reachability | Origin reachable; prod fn uses Deno `fetch` (verify on first build). |

Verified against real data: `COMMITTEE TO ELECT RAY PICKETT` (STA-Y0293T-C-001) →
80 receipts for 2024; CFOrgLkup `Name=Pickett&UseCandName` → 3 committees with
SBoEID/CandName/StatusDesc.

---

## 9. Open Questions (remaining)

1. **Roster dependency.** Discover is roster-driven, so NC finance **depends on
   beachhead Task 2** (the 170 NC legislators seeded in `candidates` with office +
   district). Confirms the strategy sequencing: finance ships after roster/votes.

2. **Committee-name ambiguity.** A few legislators may share surnames or have
   multiple committees (current + prior; e.g. Pickett returned 3 distinct people).
   Mitigation: token-match `CandName` against the roster name during discover; store
   only matched committees. If a name collision still slips through, fall back to the
   `OrgGroupID` numeric id in `CommitteeIDs` (needs format confirmation at build).

3. **Amendments / double-counting.** Reports come as `… Quarter` and `… Quarter
   (Amendment)`. An amendment **re-states** the period, so summing both double-counts.
   Decide with real data: (a) sum only non-amendment rows, (b) prefer the latest
   amendment per (committee, period), or (c) dedup by the row hash if amendments are
   pure supersets. Gate via `data-accuracy-verifier` against a hand-checked committee.

4. **Deterministic `contribution_id`.** No source id → hash. Proposed:
   `md5(sboe_id || '|' || occur_date || '|' || amount || '|' || contributor_name || '|' || report_name || '|' || ordinal_within_report)`.
   The `ordinal_within_report` guards genuine same-day/same-amount/same-donor repeats
   (Pickett's data had exact duplicate small recurring gifts). Validate collision rate
   on a real pull before committing the hash inputs.

5. **`http` extension cleanup.** It is currently enabled on `ornnzinjrcyigazecctf`
   (pre-existing, from TX/FL recon — not enabled by this session). Drop it once no
   more recon is needed (carried in `state-campaign-finance.md` wrap-up). The live
   drain uses Deno `fetch`, not this extension.

---

## 10. Build Sequence (after approval)

1. **Migration**: `nc_cf_filers`, `nc_cf_contributions`, `nc_cf_sync_runs` + RLS
   (+ `pg_trgm` for the candname index if not present). → `migration-safety-reviewer`.
2. **Secret RPC**: `check_nc_sync_secret` (mirrors `check_tx_sync_secret`).
3. **Edge fn**: `fetch-nc-finance` (discover CFOrgLkup JSON + drain ExportResults CSV).
   → `etl-pipeline-reviewer`.
4. **Cron**: `nc-drain` + `nc-discover` pg_cron (Vault auth). **Do not enable without
   review** (CLAUDE.md guardrail #2). → `observability-cron-reviewer`.
5. **RPC**: `nc_legislator_finance` (TX-style token match on `cand_name`). Validate
   totals vs cf.ncsbe.gov for 3 known legislators. → `data-accuracy-verifier`.
6. **UI**: `useNcLegislatorFinance`, `NcStateFinanceSection`, gate in
   `CandidateProfile.tsx`. → `frontend-reviewer`.
7. **Verify end-to-end** + record in `docs/DATA-ACCURACY.md`.

Scope: ~5 PRs, similar to FL. The probe has de-risked the unknowns — the build is now
mechanical (mirror TX/NJ files, swap in the CFOrgLkup/ExportResults specifics above).

---

## 11. Relationship to the NC Strategy

Per `strategy-nc-beachhead.md`: finance is **enrichment**, shipping after Task 3
(scores + public pages) is live. It does NOT gate the initial PoliScore launch. When
it ships it will be the only public aggregation of NC state-legislative finance
alongside a voter-alignment score — a real data moat.

---

*Probe complete; design ready for palidor2ks approval. No pipeline code written.*
