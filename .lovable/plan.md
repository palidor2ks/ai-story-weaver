## Goal

Make the Attach Donors search show every raw donor name variation (so admins can pick "ADELSON, MIRIAM DR.", "ADELSON, MIRIAM M.D.", etc.) and correctly indicate which raw names are already attached to an alias.

## Problem

The current `search_donors_by_name` RPC groups by `display_name`. This:
- Collapses every unattached raw variation into one row (you can't see or pick them individually).
- Surfaces the canonical alias name itself as a row (because attached donors have `display_name = canonical_name`).
- Breaks the "Current alias" indicator on consolidated rows (the lookup uses `display_name`, but members store the raw `name`).

## Fix

### 1. New RPC for the attach picker: `search_raw_donors_by_name`

Group by raw `name` + `type` instead of `display_name`. Return one row per raw variation with its total amount and record count. Result columns: `donor_name`, `type`, `total_amount`, `transaction_count`.

Search predicate: `name ILIKE '%query%'` only (do not also match on `display_name`, so the canonical alias name doesn't pull in collapsed rows).

### 2. Update the panel to use the new RPC

In `src/hooks/useDonorsPaginated.ts` add `useSearchRawDonors(searchTerm, donorType)` calling the new RPC.

In `src/components/admin/DonorAliasesPanel.tsx`:
- Switch the Attach Donors tab to `useSearchRawDonors`.
- Use `donor_name` (raw) as the row label so each variation is visible.
- Keep the existing `donor_alias_members` batch lookup keyed on raw `name|type` — it will now resolve correctly for every row.

### 3. Result

Searching "Adelso" returns every raw variation (DR., M.D., O., OCHSHORN, NANCY, ROBERT S, ANDREW, EDWARD, …) as separate selectable rows. Rows already attached show the alias badge; unattached rows show "—". The canonical alias name no longer appears as a phantom donor row.

## Files touched

- New migration: `search_raw_donors_by_name` RPC (security definer, search_path public).
- `src/hooks/useDonorsPaginated.ts` — add `useSearchRawDonors`.
- `src/components/admin/DonorAliasesPanel.tsx` — swap hook + row label in the Attach tab only. Manage Aliases tab unchanged.

No schema changes; no edge function changes.
