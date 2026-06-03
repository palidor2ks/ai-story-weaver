# State-Legislator Campaign Finance — Ingestion Playbook

Federal candidates get finance data from the FEC pipeline. State legislators
are **not** in FEC data, so each state's disclosure portal must be ingested
separately. This doc is the reusable playbook: the shared architecture, the
finished NJ reference implementation, and the confirmed plan for the next
state (FL). The long-term goal is one ingestion per state, surfaced in the
**same place as federal finance** on the candidate profile.

> **Hard requirements** (from product): fully **automated / server-side**, **no
> manual downloads**, and **visible to users** in-app alongside federal data.

---

## The shared pattern (mirror this for every state)

Each state adds the same five pieces. NJ is the reference — copy its files and
swap the state-specific bits.

1. **Schema** — three tables, RLS public-read:
   - `<st>_entities` — committees/candidate filing entities (the "who").
   - `<st>_contributions` — line-item contributions (the "what"), with a
     `synced_at` cursor column so the drain is resumable.
   - `<st>_sync_runs` — run log (mode, counts, started/finished, error).
   - NJ migration: `supabase/migrations/20260603010000_nj_elec_state_finance_schema.sql`
     (+ `...020000_..._contrib_sync_cursor.sql`).

2. **Edge function** — `supabase/functions/fetch-<st>-finance/index.ts` with
   modes:
   - `discover` — enumerate filing entities for the state's legislative
     offices (Senate + lower house) and upsert into `<st>_entities`.
   - `drain` — for entities missing contribution data (cursor null/oldest),
     fetch line items, upsert into `<st>_contributions`, stamp the cursor.
     Time-budgeted (~110s) and idempotent so cron can resume across runs.
   - `full` — convenience: discover then drain.
   - **Locked down** with a shared secret: the function calls an RPC
     (`check_<st>_sync_secret`) to compare a caller-supplied token against a
     Vault secret, so only cron (which reads the secret from Vault) can invoke
     it. NJ uses `NJ_SYNC_SECRET`; see
     `supabase/functions/fetch-nj-elec-finance/index.ts` and
     `...190100_nj_sync_secret_rpc.sql`.

3. **Cron** — two pg_cron jobs, both authing via Vault-stored keys/secret
   (pg_net `net.http_post`, `Authorization: Bearer <publishable key from Vault>`
   + the sync-secret header):
   - `<st>-drain` — frequent (NJ: `*/3 * * * *`) to chew the backlog.
   - `<st>-discover` — weekly to pick up new filers.
   - NJ migration: `...030000_nj_elec_cron.sql` (+ `...190200_..._cron_secret.sql`).
   - **Auth gotcha (learned the hard way):** the cron's bearer must be the
     project's **publishable key** read from Vault, not the legacy anon key —
     a mismatch 401s the function. See `...200000_fix_congress_donor_cron_auth.sql`.

4. **Matching RPC** — `<st>_legislator_finance(p_name, p_district, p_office)`:
   matches an official to ELEC/portal entities and returns
   `{ matched_entities, total_raised, contribution_count, election_years,
   top_contributors }`. NJ migration: `...040000_nj_legislator_finance_rpc.sql`
   (hardened by `...210000_..._filter_summaries.sql` and
   `...220000_..._robust_match.sql`).
   - **Matching gotchas (all hit in NJ):**
     - Office strings contain `senat`/`assembl` as substrings — match on
       `%senat%` / `%assembl%`, **not** `%senate%` (fails on "State Senator").
     - **Exclude federal** offices that also contain "senat" (e.g. "U.S.
       Senator") so the FEC pipeline owns those.
     - **Nicknames**: portals store legal names ("VITALE, JOSEPH F") vs app's
       "Joe Vitale". Match on **district + chamber + surname-substring**
       (surname = text before the comma, letters-only), not full name.
     - **Filter summary/rollup line-items** that aren't real contributions:
       regex out `less than|under $N|interest income|carry over|lump sum|
       unitemized|not itemized|threshold` etc.

5. **UI + gate** — surface it on the candidate profile, same place as federal:
   - Gate hook `is<St>StateLegislator({ state, office, level })` — returns true
     only for that state's legislative chambers, excludes `level === 'federal'`
     and U.S. Congress offices.
   - Data hook `use<St>LegislatorFinance(params)` — React Query → the RPC.
     RPC isn't in generated types yet, so cast `supabase.rpc as unknown as ...`.
   - Component `<StStateFinanceSection .../>` — renders the card; **hides when
     `total_raised <= 0`** so unmatched officials show nothing (not an empty
     card). Mounted in `src/pages/CandidateProfile.tsx` before the Tabs.
   - NJ files: `src/hooks/useNjLegislatorFinance.ts`,
     `src/components/NjStateFinanceSection.tsx`.

### How a state official resolves in the app (why the section renders)

State/local officials are **persisted to `candidate_overrides`** by
`fetch-civic-officials` (via `EdgeRuntime.waitUntil(persistAndResearchOfficials)`),
and `useCandidate(id)` resolves them through that override path. So the finance
section mounts on their profile as long as `state`/`office`/`district` are set.
(NJ verified end-to-end: Bob Smith renders $1,115,740 / 814 contributions,
matching ELEC exactly. Vitale $612K, O'Scanlon $693K, Zwicker $1.55M.)

---

## Recon from the sandbox (how to probe a portal at all)

The agent sandbox **blocks outbound HTTP to external hosts** (`*.supabase.co`,
state portals, Playwright CDNs all 403 `host_not_allowed`). The DB's egress is
open, so **use the database as an HTTP proxy**:

- **Synchronous** (best for interactive recon): the `http` Postgres extension —
  `select (http_get('<url>')).status, ...`. Supports form-encoded POST too,
  which NJ needed (its API uses ASP.NET `[FromForm]` binding).
- **Asynchronous**: `pg_net` — `net.http_get/post` returns a request id; read
  the result from `net._http_response`.

> **Security:** the `http` extension is **currently DROPPED** and `pg_net` is
> not enabled on `PulseApp` (`wefvanuuduvtcikkmlmd`) — by design, after recon.
> Re-enable **only** for a recon probe, then **drop again**:
> `create extension if not exists http with schema extensions;` …probe…
> `drop extension if exists http;`
> Cron-side HTTP for the live pipeline uses pg_net on whichever project hosts
> the finance crons — confirm with `select extname from pg_extension;`.

---

## NJ — DONE (reference implementation)

- Portal: NJ ELEC `njelecefilesearch.com` (ASP.NET Core MVC + DataTables).
- API: form-encoded POST, `columns[i][data]` bracket notation. Office codes
  1=State Senate, 2=State Assembly. Endpoints `/api/VWEntity/Entities20`,
  `/api/VWContributionDetail/GetContBitsDataByObject`, `.../DownlodDataCSV`.
- Status: **live & self-running** — ~1,516 entities, ~$114M ingested; drain
  every 3 min, discover weekly. Renders in-app. Shipped via PRs through #198.

---

## FL — NEXT (recommended; confirmed cleanest)

**Why FL over PA/NY/KY:** plain CGI, no WAF, simple GET params — likely
*simpler* than NJ's reverse-engineered DataTables API.

### Confirmed by recon (last session)
- Page `https://dos.elections.myflorida.com/campaign-finance/contributions/`
  → **HTTP 200**, no WAF/JS-gate (28 KB static HTML).
- Form action: **`/cgi-bin/contrib.exe`** (resolves to
  `https://dos.elections.myflorida.com/cgi-bin/contrib.exe`).
- Captured `<input>` fields: `CanFName`, `CanLName`, `CanNameSrch`,
  `cdistrict`, `cdollar_minimum`, `cdollar_maximum`, `cgroup`, `search_on`.
  (The probe captured inputs only; the page also has `<select>` elements —
  office, election, sort, and almost certainly the output-format toggle — not
  yet captured.)

### The one thing to verify on resume (1 call)
FL's DOE campaign-finance DB has long supported a **tab-delimited text export**
(the canonical way researchers/FollowTheMoney pull FL data). Confirm the
`queryformat=2` export still returns clean delimited rows. Re-enable `http`,
then probe (swap a common surname / small `rowlimit`):

```sql
create extension if not exists http with schema extensions;
select (r).status, (r).content_type, length((r).content) as len,
       array_length(string_to_array((r).content, E'\n'),1) as lines,
       left((r).content, 1600) as preview
from (select http_get(
  'https://dos.elections.myflorida.com/cgi-bin/contrib.exe'
  || '?election=&search_on=1&CanFName=&CanLName=SMITH&CanNameSrch=2'
  || '&office=&cdistrict=&cgroup=&cdollar_minimum=&cdollar_maximum='
  || '&cdate1=&cdate2=&csort1=DAT&queryformat=2&rowlimit=15&Submit=Submit'
) as r) s;
drop extension if exists http;
```
- **Expect:** `text/plain` (or octet-stream), one header row + N tab/comma rows.
  Columns are typically Candidate/Committee, Date, Amount, Type, Contributor
  Name, Address, City, State, Zip, Occupation, In-kind desc — **confirm the
  exact header at build time and map them in the drain.**
- **If `queryformat` is ignored** (returns HTML): grab the page's `<select>`
  options first (same `http_get` on the `/contributions/` page, look for
  `name="queryformat"` / format radio) to find the real export toggle.
- **Office/district filters:** FL state offices are State Representative (House,
  120 districts) and State Senator (40 districts). Confirm the `office`/`cgroup`
  codes from the form's `<select>` options.

### Build steps (after verification)
Follow "The shared pattern" with prefix `fl`:
1. `supabase/migrations/<ts>_fl_finance_schema.sql` — `fl_entities`,
   `fl_contributions` (+ `synced_at` cursor), `fl_sync_runs`, RLS public-read.
2. `supabase/functions/fetch-fl-finance/index.ts` — discover (enumerate
   House+Senate candidates) + drain (pull `queryformat=2` per candidate, parse
   delimited rows) + secret gate (`check_fl_sync_secret` / `FL_SYNC_SECRET`).
   FL is GET-based, so no form-encoding gymnastics — simpler than NJ.
3. `<ts>_fl_finance_cron.sql` — `fl-drain` (*/3) + `fl-discover` (weekly),
   Vault-authed (publishable key + secret header).
4. `<ts>_fl_legislator_finance_rpc.sql` — `fl_legislator_finance(...)` with the
   same robust matching (district + chamber + surname substring, summary
   filter).
5. UI: `src/hooks/useFlLegislatorFinance.ts` + `isFlStateLegislator`,
   `src/components/FlStateFinanceSection.tsx`, mount in `CandidateProfile.tsx`.

---

## PA — BACKUP (not yet probed)

PA Dept. of State campaign finance: `www.dos.pa.gov` / the PA campaign finance
search. Bulk **annual data export ZIPs** are published (contrib/filer/expense
CSVs) — if those are still posted, ingestion could be even simpler than a
per-candidate query (download the year's ZIP, parse, upsert). Probe both the
search endpoint and the bulk-export URLs before choosing query-vs-bulk.

---

## Outstanding wrap-up (do at the very end, after the FL build)

- **Revert `.mcp.json` to read-only.** Write mode (the `--read-only` flag was
  removed to allow `apply_migration`/`execute_sql`/`deploy_edge_function`) must
  be restored on `main` to lock the agent's DB access back down once all DB
  work is finished. This is the final security step.
- Re-confirm `http`/`pg_net` are dropped/disabled on `PulseApp` after any recon.
