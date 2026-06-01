## Goal

Port the changes from PR #156 (ai-story-weaver) into this project to make upcoming-ballot results match the user's full address context (state + congressional district + city) and clarify UI copy distinguishing ballot candidates from current representatives.

All four target files already exist here with compatible structure (`geocode.city` is exposed by `useGeocode`), so the diff applies cleanly.

## Changes

### 1. `supabase/functions/fetch-upcoming-elections/index.ts`
- Add helpers: `normalizeDistrict`, `normalizeText`, `normalizeCity`, `districtJurisdiction`, `jurisdictionMatchesCity`, `electionMatchesUserContext`.
- Accept and normalize `district` and `city` from the request body; capture `lat`/`lng` as nullable numbers.
- Use `normalizedDistrict` in the FEC candidate fetch path and for `jurisdiction` / `source_ref` consistency.
- Replace the loose cache check with a scope-aware check that requires fresh rows covering: national/state-wide federal, the user's House district, and the user's city (when known). Log the cache decision.
- After read-back, filter rows through `electionMatchesUserContext` before grouping into `federal` / `state` / `local`. Log read-back scope.

### 2. `src/hooks/useUpcomingElections.ts`
- Include `geocode.city` in the React Query key and bump version to `v2`.
- Pass `city: geocode.city ?? undefined` in both the initial query body and the force-refresh body.

### 3. `src/components/profile/UpcomingElectionsCard.tsx`
- Rename card title to "Candidates on Your Upcoming Ballot".
- Add helper subtitle clarifying that ballot candidates differ from current representatives and are matched by address/district/local jurisdiction.
- Update empty-state copy and the local-coverage hint to be more specific about address-scoped data and refresh guidance.

### 4. `src/pages/UserProfile.tsx`
- Rename "Your Representatives" → "Your Current Representatives" (heading, loading states, error states, empty state, refresh tooltip/aria-label, regenerate-summaries hint, add-address prompt).

## Out of scope

- The Supabase branch-preview migration error in the PR (`candidate_committees_candidate_id_fkey` already exists) is unrelated and not reproduced here; no migration changes will be applied.

## Validation

- After edits, confirm the edge function still type-checks (Deno syntax preserved).
- Manually verify on `/profile` that the card shows the new heading/copy and that the network call to `fetch-upcoming-elections` includes `city` in the body.
