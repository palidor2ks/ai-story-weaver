## Goal

Apply the changes from PR #139 (allow admins to assign a primary cause directly to a donor search result without requiring an alias) and fix issues in the PR before landing.

## Issues found in the PR (to fix while implementing)

1. **Missing GRANTs on the new public table.** Project rule requires explicit grants for every new `public` table; the PR migration only sets RLS. Without grants, PostgREST returns permission errors at runtime.
2. **Migration timestamp is older than existing migrations** (`20260530000000` vs. latest `20260530123856`). Rename to a fresh timestamp so it runs after current head on every environment.
3. **Supabase branch build error in the PR is unrelated** — it's a pre-existing `candidate_committees_candidate_id_fkey` conflict in an older migration on the preview branch, not caused by this PR. No action needed here.
4. **Minor:** PR uses `(supabase as any)` because generated types don't yet include the new table. Acceptable until `types.ts` regenerates; keep the cast.

## Changes

### 1. New migration `supabase/migrations/<fresh-ts>_donor_cause_overrides.sql`
- Create `public.donor_cause_overrides` (id, donor_name, donor_type, primary_cause_id text FK → `committee_causes(id)`, assigned_by, assigned_at, created_at, updated_at, UNIQUE(donor_name, donor_type)).
- Indexes on `(donor_name, donor_type)` and `(primary_cause_id)`.
- **Add grants** (this is the fix vs. PR):
  ```sql
  GRANT SELECT ON public.donor_cause_overrides TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.donor_cause_overrides TO authenticated;
  GRANT ALL ON public.donor_cause_overrides TO service_role;
  ```
- Enable RLS.
- Policies: public SELECT (overrides are non-sensitive lookups), admin ALL via `has_role(auth.uid(),'admin')`, service_role ALL.

### 2. `src/components/admin/DonorAliasesPanel.tsx`
Apply PR diff verbatim:
- Import `useMutation`, `useQueryClient`, `toast`; drop `useUpsertCommitteeTopic`.
- Remove `rowCommitteeIdsMap` state and its population in the treasurer effect.
- Remove dead `aliasCommitteeIds` / `committeeCauseRows` / `causeByCommitteeId` block.
- Add `directDonorCauseRows` query and `directCauseByDonorKey` memo keyed on `name|type`.
- Add `updateDirectDonorCause` mutation that upserts into `donor_cause_overrides` and invalidates `['donor-cause-overrides']` + `['donor-causes']`.
- In the search-results row render: when there is no `currentAlias`, render the new `DirectDonorCauseCell` (Select of causes + "Admin" source chip) instead of the "Attach to alias first" placeholder.
- Add `DirectDonorCauseCell` component at bottom of file.

### 3. `src/hooks/useDonorCauses.ts`
Apply PR diff verbatim:
- New **step 1**: fetch `donor_cause_overrides` (with embedded `committee_causes`) for the requested names/types and seed `result` map first.
- Renumber existing comments to 2/3/4.
- When seeding alias-level cause, skip if `result.has(key)` is already set by an override (`if (alias.primary_cause_id && !result.has(key))`).

## Out of scope
- Regenerating `src/integrations/supabase/types.ts` (will refresh after the migration runs; PR uses `as any` to bridge in the meantime).
- Fixing the unrelated `candidate_committees_candidate_id_fkey` migration conflict surfaced on the PR's Supabase preview branch.
- Mirroring this UI anywhere outside the Donor Aliases admin panel.

## Verification
- TypeScript compiles.
- Open Admin → Donor Aliases → search a donor that is **not** attached to any alias → the new cause Select appears and an upsert succeeds (toast + the chip flips to "Admin" on refetch).
- For a donor with an override, `useDonorCauses` returns the override cause regardless of any alias/committee-derived cause (override wins).
- Removing the alias-attached cause still falls back to committee-topic cause when no override exists.
