## Goal

Remove the auto-matching donor alias system. Aliases become simple records (canonical name + notes). Admins explicitly attach donor rows to an alias — one at a time or by selecting many at once.

## Database changes

1. **Wipe existing data and reshape `donor_aliases`**
   - `TRUNCATE donor_aliases`.
   - Drop columns: `alias_pattern`, `alias_patterns`, `donor_type`, `donor_types`.
   - Keep: `id`, `canonical_name`, `fec_committee_id` (optional), `notes`, `is_active`, timestamps.

2. **New attachment table `donor_alias_members`**
   - Columns: `id uuid pk`, `alias_id uuid → donor_aliases.id on delete cascade`, `donor_name text`, `donor_type text`, `created_at`.
   - Unique on `(donor_name, donor_type)` — a donor row can only belong to one alias.
   - Index on `alias_id`.
   - RLS: admin-only writes; public read.

3. **Replace `resolve_donor_display_name(name, type)`**
   - Lookup against `donor_alias_members` joined to active aliases. Fallback to passed-in name.
   - The existing `BEFORE INSERT` trigger on `donors` keeps using this function, so new imports automatically get `display_name` set if a member row exists.

4. **Drop / replace**
   - Drop `count_donors_matching_patterns`.
   - Drop `refresh_donor_display_names()` (the SQL function).
   - Reset `donors.display_name = donors.name` for all rows (clean slate after wipe).

## Edge function changes

- Delete `apply-donor-alias`, `unapply-donor-alias`, `refresh-donor-display-names`.
- Add `attach-donors-to-alias` (admin-auth, JSON body):
  - Input: `{ alias_id, donors: [{ name, type }] }` (1..N).
  - Inserts member rows (on conflict, reassign to this alias).
  - Updates matching `donors.display_name` to alias canonical name.
  - Refreshes `donor_consolidated_mv`.
- Add `detach-donors-from-alias`:
  - Input: `{ donors: [{ name, type }] }`.
  - Deletes member rows; resets affected donors' `display_name` to `name`.
  - Refreshes MV.

## Frontend changes (`DonorAliasesPanel.tsx` + `useDonorAliases.ts`)

- Strip pattern UI: remove `alias_patterns` editor, donor-type checkboxes, "Refresh Display Names", "Backfill alias", per-alias match counts.
- **Aliases tab** — simple list: canonical name, member count, notes, active toggle, edit/delete. Create/edit dialog only collects canonical name + notes + optional FEC committee id.
- **Search Donors tab** — keep donor search; each row shows current alias (if any) and gets:
  - "Attach to alias" → opens picker dialog with searchable list of aliases (or "Create new alias from this donor").
  - Multi-select checkboxes + sticky bar: "Attach N selected to alias…" → same picker, calls `attach-donors-to-alias` once.
  - "Detach" button when already attached.
- Update `useDonorAliases` hook: drop pattern/type/match-count helpers; add `useAttachDonors`, `useDetachDonors`, `useAliasMembers(aliasId)`.

## Out of scope

Per user: committee/PAC-side aliasing is skipped. Existing committee allocation tab stays unchanged.

## Technical notes

- `donors.type` is the existing enum (`Individual | PAC | Organization | Unknown`). The new flow works for all four types uniformly — no dedicated PAC/Organization path needed.
- All current pattern-based aliases will be lost (user approved wiping).
- After deploy, admins re-create aliases manually.
