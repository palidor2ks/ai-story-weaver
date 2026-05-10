## Problem

For Iowa, the user saw every state legislator instead of just the two (one State Senator + one State Representative) covering their address.

## Root Cause

In `supabase/functions/fetch-civic-officials/index.ts` (`fetchOpenStatesOfficials`):

```ts
if (lat && lng) {
  legislatorsUrl = `https://v3.openstates.org/people.geo?lat=...&lng=...`;
} else {
  legislatorsUrl = `https://v3.openstates.org/people?jurisdiction=${state}&per_page=50`;
}
```

- `people.geo` returns **only the user's district reps** (correct).
- The fallback `people?jurisdiction=...` returns **all legislators in the state** (wrong — this is what produced the Iowa flood). Per project memory, Open States caps `per_page` at 50, which happens to cover much of Iowa's lower chamber, making the bug very visible there.

When geocoding fails (or `lat`/`lng` aren't passed in), we silently fall back to the jurisdiction-wide list.

## Fix

1. **Edge function — remove the jurisdiction-wide fallback for state legislators.**
   - In `fetchOpenStatesOfficials`, if `lat`/`lng` are missing, log a warning and return `{ legislators: [], governors }` for the legislators portion. Do not fetch jurisdiction-wide.
   - Governor/executive fetch (which is intentionally state-wide) stays as-is.

2. **Edge function — try harder to obtain coordinates before giving up.**
   - In the main handler, if `coords` is still null after the hint + `geocodeAddress` attempt, attempt one more lookup using a normalized address (already partially done in `geocodeAddress`); if still null, skip the legislators fetch as above.

3. **Defensive frontend filter (belt-and-suspenders).**
   - In `useCivicOfficials.ts`, after receiving `stateLegislative`, if `geocode.district` is known, optionally filter legislators whose `district` doesn't match. This is secondary — the edge-function fix is the real cure — and only added if it doesn't risk hiding a correct match (Open States districts are formatted as `${STATE}-${district}` whereas civic geocode districts may differ; we will only filter if formats match).

## Files Touched

- `supabase/functions/fetch-civic-officials/index.ts` — change the fallback branch in `fetchOpenStatesOfficials`.
- (optional) `src/hooks/useCivicOfficials.ts` — add a guarded district filter once we confirm format compatibility.

## Verification

- Open the Feed with an Iowa address. Confirm only one State Senator and one State Representative appear.
- Test with an address that fails to geocode (e.g., a malformed entry) — confirm zero state legislators appear instead of 50.
- Test a NJ/CA address still returns the user's two state legislators via the geo endpoint.

## Out of Scope

- Changes to local/federal/governor fetchers.
- Changes to scoring or display.
