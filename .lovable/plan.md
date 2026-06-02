## Goal
Collapse the existing duplicate-rep rows (e.g. three Michele Lombardis) into a single canonical person each, and stop the AI ingestion path from creating new ones.

## Steps

### 1. Smarter office normalization
Update `normalize_office_key()`:
- Strip parenthetical suffixes: `town council member, piscataway (ward 4)` → `town council member, piscataway`
- Collapse `ward\s*\d+` → `ward`
- Collapse `at[- ]large`, `district\s*\d+` → generic tokens
- Treat `town council member` / `ward council member` / `council member` as equivalent (map all to `council member`)
- Strip city prefix that already lives in `state`

Then re-run `resolve_person()` over `candidates`, `static_officials`, `election_candidates` so each row recomputes its `person_id` against the new keys. Many same-name+state variants collapse onto one `person_id` immediately.

### 2. Auto-merge confident pairs
Add `public.auto_merge_obvious_persons()` (admin-only). For each `(normalized_name, state)` group with >1 person row, pick the winner by provenance:
1. has `bioguide_id`
2. has `fec_candidate_id`
3. has `openstates_id`
4. has a backing `static_officials` row
5. oldest `created_at`

Then call `merge_persons(winner, loser)` for every loser. Returns merged count.

### 3. AI candidate cleanup RPC
Add `public.cleanup_redundant_ai_candidates()` (admin-only). Deletes rows from `candidates` where ALL of:
- `id LIKE 'ai_%'`
- `fec_candidate_id IS NULL`
- another roster row (`static_officials` or non-ai `candidates`) shares the same `person_id`
- the AI row has no `claimed_by_user_id`, no `candidate_answers`, no `candidate_votes`, no `candidate_overrides`

Returns deleted count. Safe because dependent data is checked.

### 4. Upgrade the Duplicate Persons panel
Add two buttons at the top:
- **Run auto-merge** → calls step 2 RPC, refreshes lists, toasts count.
- **Cleanup AI seed candidates** → calls step 3 RPC, refreshes.

Plus per-row **"Delete source row"** button on the existing "multiple source rows" list so admins can prune losers manually for the cases auto-merge couldn't decide.

### 5. Ingestion guard
In the AI candidate-seeding edge function (and any other code path that inserts into `candidates`), before insert:
- Call `resolve_person(name, state, office, fec_candidate_id)`.
- If the returned `person_id` already has a `static_officials` row OR a non-ai `candidates` row → skip insert and log.
- Otherwise proceed.

Prevents the bleed at the source.

## Technical notes
- Step 1 is a migration: `CREATE OR REPLACE FUNCTION normalize_office_key`, then a one-shot `UPDATE` block that nulls and re-resolves `person_id` on all three roster tables. Orphaned `persons` rows (no more references) are deleted in the same migration.
- Step 2 and 3 are `SECURITY DEFINER` functions with explicit `has_role(auth.uid(), 'admin')` checks; `GRANT EXECUTE ... TO authenticated`.
- Step 5 needs to find the seeding edge function — likely `seed-local-candidates` or similar. Will grep `supabase/functions` for inserts into `candidates` with `ai_` IDs and wrap each call site.

## Out of scope
- Real same-name distinct humans (different `office_key` after normalization). Stay manual via the panel.
- Reverting an auto-merge — no automated unmerge; admins re-create via the existing Static Officials editor.