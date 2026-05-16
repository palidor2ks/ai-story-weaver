## Goal

Make sure aliases like "ActBlue" can never exist twice (case/space variants included). Currently there's only one ActBlue row, but `donor_aliases.canonical_name` has no uniqueness — nothing stops a second "actblue", "ActBlue ", or "ACT BLUE" from being inserted.

## Changes

### 1. Database — enforce uniqueness (migration)

- Add a case-insensitive unique index on `donor_aliases.canonical_name`:
  ```sql
  CREATE UNIQUE INDEX donor_aliases_canonical_name_ci_uniq
    ON public.donor_aliases (lower(btrim(canonical_name)));
  ```
- Safe to add now — query above confirms zero existing duplicates.

### 2. Create-alias hook — friendly dedupe (`src/hooks/useDonorAliases.ts`)

In `useCreateDonorAlias.mutationFn`, before inserting:
- Look up an existing alias with `ilike('canonical_name', trimmed)`.
- If found: skip insert, return the existing row, and show a toast `Alias already exists — using existing "<name>"` instead of a generic DB error.
- If not found: insert as today (the new DB constraint is the backstop).

Also trim `canonical_name` before insert/update so trailing-space duplicates can't sneak in.

### 3. Update-alias hook — same guard

In `useUpdateDonorAlias`, if the user renames an alias into another existing alias's name, surface a clean error toast instead of the raw Postgres unique-violation message.

## Out of scope

- No changes to attach/detach flow, MV refresh, or the ActBlue alias's existing 18 members.
- No data migration needed (no current duplicates).

Confirm and I'll implement.