## Problem

Trump's and Vance's photos are missing on Candidates, Profile, and Quiz Results pages, but show correctly on the Feed page.

- Feed page reads them from the `candidates` table, which already has working portrait URLs (Wikimedia / White House).
- Candidates / Profile / Quiz Results read them from the `fetch-civic-officials` edge function, which builds:
  - Trump: `https://bioguide.congress.gov/bioguide/photo/P/P80001571.jpg` → **403 Forbidden**
  - Vance: `https://bioguide.congress.gov/bioguide/photo/V/V000137.jpg` → **403 Forbidden**
- The browser hides the broken image and shows the colored-initials fallback (`DT`, `JV`).

The sister function `fetch-representatives` already overrides these two bioguide IDs with working White House portrait URLs. `fetch-civic-officials` was never updated.

## Fix

1. Update `supabase/functions/fetch-civic-officials/index.ts`, in `fetchFederalExecutiveFromGitHub`:
   - For `P80001571` (Trump), set `image_url` to the working White House portrait URL.
   - For `V000137` (Vance), set `image_url` to the working White House / Wikimedia portrait URL.
   - Keep the bioguide pattern as the default for any other future executives.

2. Bump the React Query key version in `src/hooks/useCivicOfficials.ts` from `'v6'` to `'v7'` so existing 1-hour-cached responses are refetched and clients pick up the new image URLs immediately.

3. Verify
   - HEAD-check both portrait URLs return `200 image/...`.
   - Reload `/candidates`, `/profile`, `/quiz/results` and confirm Trump and Vance show real portraits, no `DT`/`JV` initials fallback.

No database migration is needed — the values are computed in the edge function each call.