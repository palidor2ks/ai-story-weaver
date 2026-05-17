## Root cause

The recent migration dropped and recreated `private.donor_consolidated_mv` and `private.donor_consolidated_all_mv`. Dropping a matview also drops all GRANTs on it. The `get_donors_paginated` RPC (called by `useDonorsPaginated`) reads from `private.donor_consolidated_all_mv`, and now hits "permission denied for materialized view donor_consolidated_all_mv" because the role executing the read no longer has SELECT on the recreated views.

## Fix

One small migration that:

1. Re-grants SELECT on both recreated matviews to the roles that need it (matching the pre-drop grants — typically `authenticated`, `anon`, `service_role`, and `postgres`).
2. Sets ownership to `postgres` so future `REFRESH MATERIALIZED VIEW` calls from the existing refresh function continue to work.
3. Makes the `get_donors_paginated` (and the search RPC if it also reads the mv) `SECURITY DEFINER` with `SET search_path = public, private` if not already — so callers don't need direct privileges on the `private` schema. This is the defensive fix that prevents this from recurring next time the matview is rebuilt.
4. Refreshes both matviews once at the end so data is populated.

No frontend changes. No schema/shape changes to the matviews themselves.

## Verification

- `/donors` loads without the "permission denied" error.
- Searching "musk" returns the single consolidated Musk card from the previous fix.
- Filter dropdowns still populate.
