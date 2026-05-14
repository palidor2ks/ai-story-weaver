# Fix: Donor alias changes not reflecting

## Root cause (confirmed in DB)

1. `refresh_donor_display_names()` runs a single UPDATE over ~1.1M donor rows from a PostgREST call → hits the 60s statement timeout, so alias create/update/delete hooks appear to succeed but `donors.display_name` is never written. Griffin rows still show 5 different display_names.
2. The Donors page reads `private.donor_consolidated_mv`, which groups by `display_name` and is never refreshed after alias changes — so even fixed rows would still appear as separate cards.

## Changes

### 1. New edge function: `supabase/functions/apply-donor-alias/index.ts`
- Admin-only auth (same pattern as `refresh-donor-display-names`).
- Body: `{ alias_id: string }`.
- Loads alias (`canonical_name`, `alias_patterns`, `donor_types`).
- For each pattern, runs batched updates of 5–10k rows:
  `UPDATE donors SET display_name = canonical_name WHERE name ILIKE pattern AND type = ANY(donor_types) AND display_name IS DISTINCT FROM canonical_name`
  paginated by `id` range to avoid timeouts; uses `EdgeRuntime.waitUntil` for tail work.
- After all patterns finish, calls `public.refresh_donor_consolidated_mv()`.
- Returns `{ success, updated_count, alias }`.

### 2. New edge function: `supabase/functions/unapply-donor-alias/index.ts`
- Admin-only.
- Body: `{ patterns: string[], donor_types: string[], canonical_name: string }` (captured before the alias row is deleted).
- For each pattern, resets matching donors back to `resolve_donor_display_name(name, type)` so the next-best alias (or raw name) wins; batched the same way.
- Refreshes the MV at the end.

### 3. SQL migration
- `public.refresh_donor_consolidated_mv()` — `SECURITY DEFINER`, `SET search_path = public, private`, runs `REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv`. Grant execute to `authenticated` and `service_role`.
- Add `CREATE UNIQUE INDEX IF NOT EXISTS` on `private.donor_consolidated_mv(primary_id)` (or `row_id` if that's the actual unique column — confirmed during implementation) so `REFRESH CONCURRENTLY` works.
- Keep `refresh_donor_display_names()` but add a deprecation comment.

### 4. `src/hooks/useDonorAliases.ts`
- `useCreateDonorAlias` / `useUpdateDonorAlias`: after the row is written, call `supabase.functions.invoke('apply-donor-alias', { body: { alias_id } })` instead of `supabase.rpc('refresh_donor_display_names')`. Toast: "Applied to N donors".
- `useDeleteDonorAlias`: capture `alias_patterns`, `donor_types`, `canonical_name` before delete, then call `supabase.functions.invoke('unapply-donor-alias', { body: { patterns, donor_types, canonical_name } })` after delete succeeds.
- Keep existing query invalidations (`donor-aliases`, `donors-consolidated`, `donors-paginated`, `candidate-donors`).

### 5. `supabase/config.toml`
- Add `[functions.apply-donor-alias] verify_jwt = true` and same for `unapply-donor-alias`.

### 6. Optional
- Add a "Re-apply all aliases" button in `DonorAliasesPanel` that loops existing aliases through `apply-donor-alias` for one-time historical reconciliation.

## Expected result for Griffin
All 43 "GRIFFIN, KE…" Individual rows → `display_name = 'GRIFFIN, KENNETH C.'`; MV refresh collapses them into one consolidated card on the Donors page.

## Question
Want me to include the optional "Re-apply all aliases" button in `DonorAliasesPanel` so you can backfill historical aliases in one click?