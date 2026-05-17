## Why "SOROS FAMILY" still appears

The alias was deleted from `donor_aliases`, but 31 donor records (≈300+ contributions) still carry `display_name = 'SOROS FAMILY'`. Aggregations group by `display_name`, so the label survives.

**Root cause:** `useDeleteDonorAlias` only resets donors that exist in `donor_alias_members`. Aliases applied via the pattern-based `apply-donor-alias` edge function stamp `display_name` on every donor matching the regex/ILIKE pattern but do **not** insert membership rows. When the alias is later deleted, the reset loop finds zero members and nothing gets cleared.

## Fix

### 1. One-time cleanup for SOROS FAMILY (and any other current orphans)
Run a migration that resets `display_name = name` for every donor where `display_name = 'SOROS FAMILY'` and no matching alias exists. Then `refresh_donor_consolidated_mv`. Generalize the cleanup to all orphaned display_names in one pass:

```sql
UPDATE donors d
SET display_name = d.name
WHERE d.display_name IS DISTINCT FROM d.name
  AND NOT EXISTS (
    SELECT 1 FROM donor_aliases a WHERE a.canonical_name = d.display_name
  );
SELECT refresh_donor_consolidated_mv();
```

### 2. Fix delete flow so this can't recur
Update `useDeleteDonorAlias` in `src/hooks/useDonorAliases.ts`:
- Before deleting the `donor_aliases` row, capture `canonical_name`, `alias_pattern`, `alias_patterns`, `donor_types`.
- After deleting, invoke the existing `unapply-donor-alias` edge function with those patterns + donor_types + canonical_name. That function already re-resolves each donor via `resolve_donor_display_name` and updates in bulk under the service role (bypasses any RLS no-op risk).
- Keep the existing member-based reset as a fallback for member-only aliases.
- Then refresh the MV (already done).

### Technical notes
- `unapply-donor-alias` already handles batched updates and MV refresh; we just need to call it from the delete mutation.
- No schema change required beyond the one-off cleanup UPDATE.
- Files touched: `src/hooks/useDonorAliases.ts` + one SQL migration.
