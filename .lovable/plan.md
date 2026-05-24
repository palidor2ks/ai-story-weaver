## Problem

“Richard” is still showing because the donor materialized views are grouping rows by the cached `donors.display_name`. The raw `donors` rows now show `Uihlein Family`, but `private.donor_consolidated_mv` is still using an older grouping result where Richard rows remain under `Uihlein, Richard`.

## Plan

1. **Refresh the donor materialized views again**
   - Refresh `private.donor_consolidated_mv`
   - Refresh `private.donor_consolidated_all_mv`
   - Refresh `private.donor_consolidated_counts_mv`

2. **Verify the public donor RPC output**
   - Check `public.get_donors_paginated(... search='uihlein' ...)`
   - Confirm only `Uihlein Family` remains for Richard/Elizabeth Uihlein alias rows
   - Confirm the combined total includes the former Richard amount

3. **If refresh still leaves stale data, rebuild the MV definitions**
   - Keep the current columns/indexes/API stable
   - Change the grouping key to resolve aliases at query time using `public.resolve_donor_display_name(d.name, d.type::text)` instead of relying only on cached `d.display_name`
   - Refresh and re-verify the RPC output

## Expected result

The Donors page search/list should show one consolidated `Uihlein Family` row instead of a separate `Uihlein, Richard` row.