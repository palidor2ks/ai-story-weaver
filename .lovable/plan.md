# Fix: Missing executives & local officials on Results page

## Root cause

The `/results` page already supports rendering Federal Executive (President/VP), State Executive (Governor), State Legislative, and Local (Mayor, council) sections. They aren't appearing because the **`fetch-civic-officials` edge function fails to parse your saved address**.

Edge function logs confirm:
```
Address: 13 ORION PL, COLONIA, NJ, 07067
State: , City: NJ
ERROR Could not extract state from address
```

Two regexes in `supabase/functions/fetch-civic-officials/index.ts` only handle `City, ST ZIP` (space) and break on `City, ST, ZIP` (comma — which is what the Census/Google Address Validation fallback returns):

- `extractStateFromAddress` (line 127): regex `/,\s*([A-Z]{2})\s+\d{5}/` requires a space between state and zip
- `extractCityFromAddress` (line 160): walks from the right, hits `07067`, picks the prior segment `NJ` as the city instead of skipping state-only segments

When state extraction returns `''`, the function returns early with only the federal executives — and even those are dropped by the page because the Federal Executive section renders only when `civicData` is populated (it is, but the bigger issue is no state/local data gets fetched).

## What to change

Single file: `supabase/functions/fetch-civic-officials/index.ts`

1. **`extractStateFromAddress`** — accept comma OR space between state and zip:
   - Replace the regex with one that matches `,\s*([A-Z]{2})\s*[, ]\s*\d{5}` and also accept `,\s*([A-Z]{2})\s*$` (no zip).

2. **`extractCityFromAddress`** — when the right-hand segment is a state-only or zip-only token, skip both and pick the segment two steps back if needed. Concretely: if `parts[i-1]` matches the state-abbrev pattern, use `parts[i-2]` instead.

3. Add one log line echoing parsed `{state, city}` so we can verify the fix from logs.

## Verification

After deploy:
- Reload `/results`. The page should show new sections: **Federal Executive**, **State Executive**, **State Legislative**, **Local Officials** (in addition to U.S. Congress).
- Confirm via `fetch-civic-officials` logs: `State: NJ, City: COLONIA` and no "Could not extract state" error.

## Out of scope

- No data-model changes. No new edge function. No UI changes — the rendering logic on `QuizResults.tsx` already exists and works.
- If after the fix some sections are still empty (e.g. no Mayor row in DB for Colonia), that's a separate data-coverage issue we can address next; the AI mayor-research is already fire-and-forget triggered by the same edge function.
