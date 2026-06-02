## Problem

"Brian Wahler" appears twice because the same human exists in two source tables (`static_officials` and `candidates`) with no shared key. The existing unifier in `useUnifiedCandidates` only dedupes by `name::office` *within* the civic/Congress/DB mix it already loads — `static_officials` isn't even part of that pipeline, and even where it is, fuzzy name collisions (e.g. "Brian Wahler" vs "Brian C. Wahler") slip through. Every new ingestion source we add re-creates this class of bug.

## Goal

A single canonical identity per real person, enforced at the database level, so no UI code has to "guess" duplicates again.

## Solution: a `person` identity table + FK from every source

```text
                ┌──────────────────┐
                │     persons      │  ← canonical row per human
                │ id (uuid) PK     │
                │ full_name        │
                │ normalized_name  │  ← generated, unique-ish
                │ state, office_key│
                └────────┬─────────┘
                         │ person_id (nullable FK)
   ┌─────────────────────┼──────────────────────┬──────────────────┐
   │                     │                      │                  │
candidates        static_officials       election_candidates    (future sources)
```

### Steps

1. **Create `persons` table** with `id`, `display_name`, `normalized_name` (generated column: lowercased, middle-initial stripped, punctuation removed), `state`, `office_key` (normalized office string), plus optional strong IDs (`bioguide_id`, `fec_candidate_id`, `openstates_id`). Unique index on `(normalized_name, state, office_key)` and partial unique indexes on each strong ID.

2. **Add `person_id uuid` column** to `candidates`, `static_officials`, `election_candidates`, and any other roster table. Nullable at first.

3. **Backfill** with a one-shot SQL migration:
   - For each row, compute `(normalized_name, state, office_key)`.
   - Insert into `persons` if not present, then set `person_id` on the source row.
   - Merge known collisions (Brian Wahler ↔ Brian C. Wahler) by collapsing on normalized name within the same state+office.

4. **Resolver trigger** on insert/update of any source table: if `person_id` is null, look up or create a `persons` row using normalized-name + state + office + any strong ID. Strong-ID match wins over name match. This guarantees future ingestions can't create orphan duplicates.

5. **Rewrite `useUnifiedCandidates` to dedupe by `person_id`** instead of `nameKey`. Include `static_officials` as a source. Field resolution priority becomes: strongest source per field (DB candidate > civic > Congress > static_officials) but keyed off `person_id`, not a string.

6. **Admin merge tool** (small addition to `/admin`): list persons with >1 source row, allow manual merge/split for the cases the resolver can't decide (e.g. two real people with the same name in the same office over different terms). One screen, one RPC.

7. **Drop the existing string-based collision rules** in `useUnifiedCandidates` once `person_id` is populated everywhere — they become dead code.

### Why this prevents recurrence

- Duplicates become a **schema violation**, not a UI heuristic. The unique index on `persons` plus the resolver trigger means a second "Brian Wahler" row in `static_officials` will attach to the *existing* person, not create a parallel identity.
- New ingestion sources only need to populate `person_id` (or let the trigger do it) — they can't reintroduce the bug.
- Admin merge tool handles the residual ambiguous cases without code changes.

### Out of scope

- Cross-state same-name disambiguation beyond `(state, office_key)` — handled manually via the merge tool.
- Historical politicians who held multiple offices over time (the office_key change is intentional; the merge tool reconciles).

### Technical notes

- Normalization function: `lower(regexp_replace(regexp_replace(name, '\b[a-z]\.\s*', '', 'gi'), '[^a-z ]', '', 'gi'))` then collapse whitespace. Stored as a generated column for index use.
- Resolver trigger uses `SECURITY DEFINER` so service-role ingestion paths and authenticated admin edits both work.
- Migration order: create `persons` → add nullable `person_id` columns → backfill → add NOT NULL + FK → install trigger.
- `useUnifiedCandidates` change is mechanical: swap `nameKey(name, office)` → `person_id` in the three Maps/Sets; keep the field-priority logic.
