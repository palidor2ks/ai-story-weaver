## What's happening

For your address (Missoula, MT), the Feed is correctly fetching:

- President + VP (federal executives)
- Senator Daines + your House rep (federal legislators)

…but the state/local sections come back nearly empty. After hitting the live edge functions with your exact address, here's what actually returns:

| Bucket | Returned for MT | Expected |
|---|---|---|
| State Executive | **Lt. Governor only** | Governor + Lt. Governor |
| State Legislative | **0** | 1 State Senator + 1 State Rep for your district |
| Local | **0** | Mayor / city council / county officials |

So the federal side is fine; the state and local sides are broken or empty. Three independent root causes:

### 1. Governor missing from Open States executive query

`fetchOpenStatesOfficials` (in `fetch-civic-officials`) queries `?org_classification=executive&per_page=10` and then filters to anything whose `current_role.title` contains "governor". For MT this is returning the Lt. Gov but not Governor Gianforte — most likely because his record either has no `current_role` populated or the title casing isn't matching. The filter is too brittle.

### 2. State legislators returning 0

The `people.geo` Open States call for `lat=46.87, lng=-113.99` returns 0 results for MT. Earlier work (per memory) intentionally restricted state legislator lookup to `people.geo` only (no jurisdiction-wide fallback) to avoid the Iowa "all legislators" bug. That guard is correct, but for MT the geo call is silently failing/empty, so users get nothing.

### 3. Local officials table only has NJ

`fetchLocalOfficialsFromDB` reads `static_officials` filtered by state. The whole table currently has only 18 rows, all `state = 'NJ'`. So every non-NJ user sees an empty Local section.

## Fix plan

### A. Make the governor filter robust (`supabase/functions/fetch-civic-officials/index.ts`)

In `fetchOpenStatesOfficials`, replace the title-only check with a check that also looks at `current_role.title`, `current_role.org_classification`, and the person's `roles[]` array. Also log every executive person returned so we can see what Open States is actually sending for MT. Keep the Lt-Gov detection as-is.

### B. Add a safe fallback for state legislators

Keep `people.geo` as the primary lookup, but when it returns 0 results, fall back to a **district-scoped** jurisdiction query: `?jurisdiction={state}&org_classification=legislature&district={district}` if we have a district, else log and return empty (do **not** revert to the old jurisdiction-wide fetch — that was the Iowa bug). For MT we can also try OpenStates' `/people` endpoint with `latitude`/`longitude` query params as a secondary, since `.geo` data coverage is uneven.

### C. Surface the gap to the user instead of silently hiding the section

In `Feed.tsx`, when `stateLegislative.length === 0` and `local.length === 0` for a user with an address, render a small inline notice under the section header ("We don't have state/local officials for your area yet — help us add them"). This avoids the impression that "only federal exists".

### D. (Out of scope for this fix, flag only) Local data

`static_officials` is empty for MT and 48 other states. Real fix is a separate ingestion task. For now, the notice in step C covers it.

## Files to touch

- `supabase/functions/fetch-civic-officials/index.ts` — steps A and B
- `src/pages/Feed.tsx` — step C (inline notice when sections are empty)

## Verification

After deploy, re-run the curl against `/fetch-civic-officials` with the MT lat/lng and confirm `stateExecutive` contains Gianforte and `stateLegislative` contains the user's MT House + Senate district reps.
