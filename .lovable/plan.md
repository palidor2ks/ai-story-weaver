## Why Colonia + Piscataway officials both appear

**Root cause:** `fetch-civic-officials` pulls local officials from **two** sources:

1. `static_officials` — properly filtered by user's city (`city IS NULL OR city ILIKE userCity`).
2. `candidate_overrides` (via `fetchManualCivicOverrides`) — filtered by **state only**. No city column exists on this table, so every NJ user receives every NJ local official, including all of Colonia's and Piscataway's town council and mayors.

Since the same people exist in both tables (e.g., `mayor_nj_colonia`, `local_nj_piscataway_*`), the override path leaks them into every NJ feed regardless of address.

## Fix

In `supabase/functions/fetch-civic-officials/index.ts` `fetchManualCivicOverrides(state, city)`:

1. Accept `city` as a second argument (already known by the caller).
2. After loading override rows, fetch the matching `static_officials` rows by `id` (only `id, city`).
3. Build a `city-by-id` map. For each override row whose level resolves to `local`:
   - Keep it if the static row's `city` is `NULL` (city-agnostic) **or** matches `city` (case-insensitive).
   - Drop it otherwise.
4. Non-local overrides (e.g., governor) are unaffected — still returned for the whole state.
5. Pass `city` through at the call site (line 963).

Result: a Piscataway voter sees only Piscataway local officials; a Colonia voter sees only Colonia ones. No DB schema changes needed.

## Out of scope

- Adding a `city` column to `candidate_overrides` (not needed; `static_officials` already has it).
- Fixing the separate data-quality issue that John E. McCormac is listed as "Mayor of COLONIA" (he's actually mayor of Woodbridge Township) — flag for a follow-up.