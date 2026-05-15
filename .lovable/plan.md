# Fix alias visibility on Donors list

## Problem

1. After **Attach**, the donor list still shows old un-merged variants for ~10–60s because `donor_consolidated_mv` refreshes in the background. The success toast misleads the user.
2. After **Delete**, the MV is never refreshed at all, so deleted aliases keep showing merged rows indefinitely.
3. **Newly created aliases** never appear on the Donors list until donors are attached — but the admin Aliases tab gives no indication.

## Plan

### 1. Refresh MV on every alias mutation

- `attach-donors-to-alias` edge function: if `donors.length <= 50`, `await` the MV refresh inline before returning. Above 50, keep `EdgeRuntime.waitUntil`.
- `useDeleteDonorAlias`: after deleting the alias + resetting orphan `display_name`s, call `supabase.rpc('refresh_donor_consolidated_mv')` (await it).
- `detach-donors-from-alias` already handled by existing flow — confirm it refreshes too; if not, add the same await for small batches.

### 2. Communicate refresh state in UI

- Update success toasts to say `… — list refreshing (~30s)` so users know to wait.
- In `DonorAliasesPanel` Attach dialog, show inline note after success: *"Donors list rebuild in progress. May take up to a minute to reflect on /donors."*
- Invalidate `donors-paginated` query on success, and refetch once after 30s.

### 3. Surface empty aliases in admin

- In `DonorAliasesPanel`, use `useAliasMemberCounts()` to render a yellow badge `0 attached — not visible publicly` next to any alias with 0 members.
- Tooltip: *"Attach donor name variations under the Attach tab so this alias shows up on the Donors page."*
- Sort 0-member aliases to the top of the Manage tab.

### 4. Better creation toast

- After `useCreateDonorAlias` succeeds, toast: `Alias created — now attach donors to make it visible on /donors`.

## Files touched

- `supabase/functions/attach-donors-to-alias/index.ts`
- `src/hooks/useDonorAliases.ts`
- `src/components/admin/DonorAliasesPanel.tsx`
