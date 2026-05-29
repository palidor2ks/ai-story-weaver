## Goal
Make the Candidates page feel fast: paint usable content in ~1 s instead of waiting on the slowest edge function, and stop rendering 500+ cards at once.

## Changes

### 1. Stop blocking the whole page on slow sources (`src/pages/Candidates.tsx`)
- Show the page as soon as DB candidates + all-Congress are ready. Treat civic officials (`fetch-civic-officials`) and address-bound reps as progressive enhancements.
- Replace the all-or-nothing spinner with:
  - Render the page when `dbCandidates` (and `allPoliticians` if `includeAllCongress`) finish.
  - Show a small inline "Loading your representatives…" badge on the **My Reps**, **State**, **Local**, and **Executive** tabs while `civicLoading` / `repsLoading` are still true.
- Expose `dbLoading`, `allLoading`, `civicLoading`, `repsLoading` separately from `useUnifiedCandidates` so the page can decide what to gate.

### 2. Virtualize the candidate grid
- Add `@tanstack/react-virtual` (already commonly used) — or simple windowed rendering: render the first 60 cards, then load the next batch on scroll via `IntersectionObserver`.
- Keep the existing grid layout; only the off-screen rows are deferred.
- This cuts initial DOM nodes from ~500 cards × deep subtree to ~60, which is the single biggest paint win.

### 3. Fix the O(N²) work in `useUnifiedCandidates`
- Build lookup `Map`s once: `allPoliticiansById`, `userRepsById`, `civicById`, `dbById`. Replace the `.find()` calls inside the `allIds.map(...)` with map lookups.
- Memoize the concatenated `civic` array (`[...federalExecRaw, ...stateExecRaw, ...stateLegRaw, ...localRaw]`) instead of rebuilding it inside `useMemo` deps and inside the per-id `.find()`.

### 4. Stabilize derived arrays in `Candidates.tsx`
- Wrap `myRepsCombined` in `useMemo` so it doesn't get a new reference every render (currently invalidates `tabCandidates`).
- Same for the inline `allCandidates.filter(c => c.office === 'Senator')` calls used in tab labels — compute office counts once.

### 5. Defer the IE lookup
- `useCandidatesIE(visibleIds)` should run on the *actually visible* slice (post-virtualization), not the first 120, and only after the initial paint. Use a `useDeferredValue` on `visibleIds` so filter typing doesn't re-fire it synchronously.

## Out of scope (separate follow-ups)
- Speeding up `fetch-civic-officials` itself (Open States 504s, sequential GitHub downloads) — that's a backend rework.
- Caching `fetch-representatives` `fetchAll: true` server-side so the GitHub download isn't repeated per cold client.
- Pagination at the API level for `all-politicians`.

## Verification
- Cold-load `/candidates`: time-to-first-card should drop from "waits on civic edge fn (10–25 s)" to under ~2 s (DB + all-politicians only).
- Scroll-through: no long-task warnings, smooth 60fps on the grid.
- Filter/search latency: instant (no full-list re-render).
- `My Reps` tab still shows civic-derived reps once `fetch-civic-officials` returns (with inline loading indicator until then).
