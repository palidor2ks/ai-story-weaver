## Problem

Clicking "EVIDENCE FOR IMPACT" (and other donors in the committee Donor Details table) lands on a blank `/donor/<uuid>` page. The route works for donors elsewhere on the site but breaks here.

**Root cause:** `useCommitteeDonors` in `src/hooks/useCommittees.ts` builds each donor row's `id` from `contributions.id` (a UUID per contribution). `DonorProfile` queries the `donors` table by that id (`.from('donors').eq('id', id).single()`) which expects an id like `fec-105309d6...`. The lookup returns nothing, so the page is blank.

Other donor links across the site (DonorCard, /donors page, candidate profile) use the proper `donors.id`, which is why they work.

## Fix

In `src/hooks/useCommittees.ts › useCommitteeDonors`:

1. After computing `rawNames`, query the `donors` table for matching records:
   ```ts
   const { data: donorRows } = await supabase
     .from('donors')
     .select('id, name, type')
     .in('name', rawNames);
   ```
   Build a `nameToDonorId` map keyed by `name` (prefer organization rows, then individual). If multiple ids exist for the same name, pick any one — DonorProfile already consolidates by name + alias.

2. When constructing each entry in `donorMap`, set `id` to:
   - the resolved `donors.id` for that name, if found
   - otherwise fall back to the contribution row id (link will still 404, but no regression from current state)

3. Keep all other behavior (alias consolidation, vendor filtering, metadata picking) unchanged.

No UI changes needed — the existing `<Link to={`/donor/${donor.id}`}>` will work once the id is correct.

## Out of scope

- Refactoring DonorProfile to accept arbitrary id types.
- Changing how the consolidated donors list works on /donors page.