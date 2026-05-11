## Why Trump's profile shows "Candidate not found"

The Feed card for the President uses the synthetic id `federal_president` (created by `fetch-civic-officials` so the same ID matches `static_officials`). Clicking it routes to `/candidate/federal_president`.

`useCandidate(id)` then runs this lookup chain:
1. `candidates` table by id → no row (Trump is stored as `P80001571`)
2. `static_officials` table by id → no row (table is empty for federal exec)
3. `id` starts with `federal_` → treated as "non-Congress", returns `null` unless an override exists
4. Result: `candidate` is null → "Candidate not found" page

So the synthetic civic ID never resolves to the real candidate row.

## Fix

Add a federal-executive resolution step inside `useCandidate` (in `src/hooks/useCandidates.ts`) so `federal_president` and `federal_vice_president` map to the active candidate row by office name.

### Steps

1. **`src/hooks/useCandidates.ts` — `useCandidate` hook**
   - Before the existing "isNonCongressId → return override-or-null" branch, add a special case:
     - If `id === 'federal_president'` or `id === 'federal_vice_president'`, query `candidates` for `office = 'President'` (or `'Vice President'`), ordered by `last_updated desc`, `maybeSingle()`.
     - Also fetch that candidate's `candidate_topic_scores` and any `candidate_overrides` keyed by the real candidate id.
     - Build the same `mergedCandidate` object as the normal DB path and return it.
   - Keep the existing `static_officials` and override fallbacks intact for other synthetic IDs.

2. **No route or Feed changes** — the Feed keeps using `federal_president` as the click target (so static_officials linkage and image resolution continue to work). Only the profile-page resolver gets smarter.

### Out of scope
- Changing how civic-officials assigns IDs (would ripple through static_officials, image resolution, and override keys).
- Backfilling `static_officials` rows for federal executive (separate data task).
- VP/President-elect / transition handling beyond the current `is_incumbent` row.

### Verification
- Click Trump's card on `/feed` → `/candidate/federal_president` loads the Donald J. Trump profile (name, party, office "President").
- Click VP card → loads VP profile if a row exists; otherwise still falls through to the existing override/null path (no regression).
- Other civic IDs (`exec_*`, `state_*`, `local_*`, `nj_*`, etc.) still hit the existing non-Congress branch unchanged.
