## PR #141 Fixes

Apply three fixes from the review:

### 1. Lock down `increment_donor_import_session` RPC (security)
New migration that:
- `REVOKE EXECUTE ... FROM authenticated, anon`
- Keeps `GRANT EXECUTE ... TO service_role` only
- Adds an internal guard: `IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;`
- Edge function continues to work since it calls with the service role key.

### 2. Fix `get_contribution_totals` migration drift
New migration that runs `DROP FUNCTION IF EXISTS public.get_contribution_totals(text, text);` followed by the current `CREATE OR REPLACE FUNCTION ...` body (copied verbatim from the existing migration) so the Supabase preview branch and any fresh environment can migrate cleanly.

### 3. Reduce client batch size in FEC importer
In the donor-import client code that posts to the edge function, drop `BATCH_SIZE` from 1500 back to **1000** rows per HTTP POST to stay safely under Edge body/CPU limits. Leave adaptive chunk-down and retry backoff in place. Add a short comment near `actualInserts = insertedContributions` noting that `newContributions` is pre-filtered so the counter is not inflated.

### Verification
- Run linter after the migrations.
- Confirm RPC call from `sync-all-donors` / FEC import edge function still succeeds (uses service role).
- Confirm a sample import completes with the new 1000-row batch without timeout.

### Technical notes
- Files touched: 2 new SQL migrations under `supabase/migrations/`, 1 client file containing `BATCH_SIZE = 1500` (will locate via `rg` in build mode).
- No type regeneration needed (function signature unchanged for `get_contribution_totals`; `increment_donor_import_session` signature unchanged).
