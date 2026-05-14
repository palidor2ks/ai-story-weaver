## Fix: Grant access to `donor_consolidated_all_mv`

The new materialized view `private.donor_consolidated_all_mv` was created but never granted to the API roles, so the RPC fails with `permission denied for materialized view donor_consolidated_all_mv`.

### Migration

```sql
GRANT SELECT ON private.donor_consolidated_all_mv TO anon, authenticated, service_role;
```

The existing `private.donor_consolidated_mv` already has these grants (which is why per-cycle works); we just need to mirror them on the new MV. No code changes required.