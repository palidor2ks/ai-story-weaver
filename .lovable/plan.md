# Speed up app-wide loading

## Why it's slow today

I traced this on `/feed` and the recent `/donors`, `/donor/:id`, `/committee/:id` traffic. It's not one slow query — it's a stack of avoidable work that fires on every page:

1. **No React Query cache config.** `src/App.tsx` does `new QueryClient()` with no options. Default `staleTime: 0` means every query refetches on mount, on tab focus, and on reconnect. Navigating Feed → Candidates → Feed re-runs the entire candidate fetch.
2. **Broken query that 400s and retries forever.** `src/pages/Feed.tsx` orders `quiz_answers` by `updated_at`, which does not exist (`column quiz_answers.updated_at does not exist`). Every Feed visit fires 3 failed requests.
3. **Heavy "fetch everything" hooks with no pagination.**
   - `useCandidates`: `select * from candidates` + full `calculated_candidate_topic_scores` + full `candidate_overrides` on every mount.
   - `useUnifiedCandidates` merges that with `useAllPoliticians` — same pattern.
   - `useUpcomingElections` and `useUnifiedCandidates` both run on Feed.
4. **Per-row hot-path subqueries in RPCs.** The donors-page fix already landed (vendor-refund regex). Other RPCs likely have the same shape — to be checked.
5. **No skeleton/streaming UX.** Pages wait for everything before rendering anything, so even fast queries feel slow.

## Fix plan

### 1. Global React Query defaults (biggest single win)
Edit `src/App.tsx`:
```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 min: don't refetch on every mount
      gcTime: 30 * 60 * 1000,       // keep cache 30 min
      refetchOnWindowFocus: false,  // stop refetching when user tabs back
      refetchOnReconnect: false,
      retry: 1,                     // don't retry 3x on hard errors like 400
    },
  },
})
```
This alone makes most navigation feel instant because cached lists render immediately while React Query revalidates in the background.

### 2. Fix the broken Feed query
`src/pages/Feed.tsx` line 36: change `order('updated_at', …)` → `order('created_at', { ascending: false })`. Stops 3 failed requests + retries on every Feed load.

### 3. Trim the candidate-list payload
In `useCandidates`:
- Replace `select('*')` with an explicit column list (drop `claimed_by_user_id`, `claimed_at`, `last_donor_sync`, etc. that the list views don't need).
- Add `staleTime: 10 * 60 * 1000` on the query (lists rarely change).
- Same for `useAllPoliticians` and `useUpcomingElections`.

### 4. Confirm no other RPCs have the per-row subquery anti-pattern
Scan the remaining `SECURITY DEFINER` RPCs called from `src/hooks/*` for correlated `NOT EXISTS … LIKE '%'||x||'%'` patterns like the one we just fixed in `get_donors_paginated`. Fix any that show up.

### 5. Add skeleton states on the slowest pages
Feed, Candidates, Donors, Committees, DonorProfile, CommitteeProfile. Render the header + filter bar + skeleton card grid immediately instead of holding the whole page on a single spinner.

### Out of scope (call out, don't do)
- Server-side pagination on `/feed` (would require an RPC + bigger refactor — propose separately if cache+payload trim isn't enough).
- Switching off Lovable Cloud / Supabase or moving to SSR.

## Technical notes

- The `quiz_answers` table has `created_at` (per the Postgres hint in the 400 response), so the fix is a one-line column swap, not a schema change.
- Setting `refetchOnWindowFocus: false` globally is the right default for this app — almost no view depends on live updates; the few that do can opt back in per query.
- Trimming `select('*')` matters more than people expect: `candidates` has many wide nullable columns and ships them as JSON over the wire on every page.
