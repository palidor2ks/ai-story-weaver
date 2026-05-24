Root cause: the alias table now maps `UIHLEIN, RICHARD...` to `Uihlein Family`, but `public.donors.display_name` and the donor materialized views are cached and still contain `Uihlein, Richard`. The donors page reads those cached values, so it keeps showing the old name.

Plan:
1. Backfill cached donor display names for active aliases so existing `public.donors` rows immediately reflect `Uihlein Family` and any other renamed aliases.
2. Refresh the three donor materialized views so `/donors` reads the corrected display names.
3. Add/adjust a database function so future alias renames can refresh affected donor display names without needing manual SQL, then verify `private.donor_consolidated_all_mv` shows one `Uihlein Family` group instead of a separate `Uihlein, Richard` group.

Technical details:
- Use `resolve_donor_display_name(name, type)` to update only cached donor display names.
- Refresh `private.donor_consolidated_mv`, `private.donor_consolidated_all_mv`, and `private.donor_consolidated_counts_mv` after the backfill.
- Avoid frontend changes; this is a database cache invalidation issue.