## Root causes

I traced both bugs end-to-end. They are independent.

### 1. Vance — broken image URL in DB

`candidates.image_url` for `V000137` is:
```
https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/JD_Vance_Vice_Presidential_Portrait.jpg/600px-JD_Vance_Vice_Presidential_Portrait.jpg
```
A direct request returns **HTTP 400** from Wikimedia (the file path no longer exists / hot‑link rejected). Every page now correctly pulls the DB image, so the broken URL surfaces everywhere — Feed, Candidates, Profile.

### 2. Trump — ID mismatch on Profile page

- `candidates` row uses Trump's FEC id `P80001571` (he has no bioguide).
- `fetch-civic-officials` builds the President from the unitedstates/congress-legislators executive YAML, where `id.bioguide` is missing, so it falls back to the synthetic id `federal_president` (line 213‑225).
- The unified DB image resolver added at line 1090 looks up `candidates.id IN (...)` using those synthetic ids → no match for Trump → his `image_url` stays empty.
- Feed / Candidates pages still show his photo because `useUnifiedCandidates` does a secondary `name+office` fallback against the DB. Profile uses `useRepresentatives` + `useCivicOfficials` directly with no DB merge, so it only sees what the edge function returned — i.e. nothing.

Vance is not affected by #2 because his civic id IS his real bioguide `V000137`, which matches the DB row. He's only broken because of #1.

## Fix plan

### A. Replace Vance's image URL in DB
Migration to update `candidates.image_url` (and `candidate_overrides` if a row exists) for `V000137` to a stable, hot‑link‑safe official portrait. Two acceptable sources:
- White House VP portrait: `https://www.whitehouse.gov/wp-content/uploads/2025/01/47-Vice-President-JD-Vance.jpg` (verify 200 before committing)
- Senate historical bioguide: `https://bioguide.congress.gov/bioguide/photo/V/V000137.jpg`

I'll curl both, pick the one returning 200 with a real image, and write a single migration. No code changes needed — the unified resolver and edge function already pull from the DB.

### B. Make the edge-function image resolver match Trump
In `supabase/functions/fetch-civic-officials/index.ts` extend the resolver block (lines 1090‑1133) so it also matches by `name + office` for officials whose id didn't hit (just like `useUnifiedCandidates` does on the client):

```text
1. Build candidate-id lookup as today.
2. For officials still missing image_url after step 1, batch-fetch
   candidates by name (case-insensitive) and apply if office matches.
3. Same fallback against candidate_overrides.
```

This keeps Profile / QuizResults aligned with Feed / Candidates without having to refactor those pages onto `useUnifiedCandidates` right now.

### C. Bump cache key
Bump `useCivicOfficials` query key `'v8' → 'v9'` so clients refetch immediately.

### Out of scope
- No DB schema changes.
- No refactor of Profile / QuizResults onto `useUnifiedCandidates` (separate, larger task we already noted).
- No changes to Trump's DB row — his image is correct and reachable (verified HTTP 200).

## Verification after build
1. `curl -I` the new Vance URL → expect 200.
2. Reload Feed, Candidates, and Profile in the preview — both Trump and Vance photos render on all three.
3. Edge function logs show `[ImageResolver] Applied DB image_url for N overrides + M candidates` with a Trump match in the count.
