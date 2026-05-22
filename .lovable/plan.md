
# Speed up Committee Causes panel

## Problem
Panel fetches ~5k candidate committees + IE spenders + (soon) ~20k external PACs client-side, then merges/dedupes/sorts in JS. Load time scales linearly with PAC universe.

## Solution
Move the union/dedupe to Postgres, paginate, and cache as a materialized view.

## Steps

1. **Migration: `committee_pool_mv` + RPC**
   - `committee_pool_mv` materialized view unioning:
     - `candidate_committees` (excluding designation P/A)
     - `list_ie_spenders` (existing IE table)
     - `external_pacs`
     Deduped by `fec_committee_id` with source priority (candidate > IE > standalone).
     Columns: `fec_committee_id`, `name`, `designation`, `committee_type`, `source`.
   - Unique index on `fec_committee_id` (enables `REFRESH CONCURRENTLY`).
   - Trigram index on `name` for search.
   - `list_committee_pool(p_search, p_source, p_assigned, p_limit, p_offset)` RPC: joins MV with `committee_topics`, filters, returns rows + `total_count`. Granted to `authenticated` + `service_role`.
   - `refresh_committee_pool()` helper (SECURITY DEFINER, admin-only).

2. **Frontend: `useCommitteePool` hook**
   - Replaces `useExternalCommittees`.
   - React Query with `keepPreviousData`, 300ms debounced search, page size 100.
   - Single RPC call per page.

3. **`CommitteeTopicsPanel.tsx` updates**
   - Use new hook; drop in-memory merge/dedupe/sort over full set.
   - Add Prev/Next pagination + page indicator.
   - Add "Refresh pool" admin button (calls `refresh_committee_pool`).
   - Keep existing source filter + assigned/unassigned filter (now server-side).

4. **`classify-committee-topic` edge function**
   - Replace 3 paginated pool queries in auto-pick branch with one `select from committee_pool_mv where fec_committee_id not in (select ... from committee_topics) limit N`.

5. **Auto-refresh hooks**
   - `sync-fec-committees` and `import-fec-committee` call `refresh_committee_pool()` after completion.

## Out of scope
- Virtualized table (not needed at 100 rows/page).
- Realtime updates (manual refresh button is sufficient for an admin screen).

## Files
- New migration (MV, indexes, RPC, refresh function)
- New `src/hooks/useCommitteePool.ts`
- Edit `src/components/admin/CommitteeTopicsPanel.tsx`
- Edit `supabase/functions/classify-committee-topic/index.ts`
- Edit `supabase/functions/sync-fec-committees/index.ts`
- Edit `supabase/functions/import-fec-committee/index.ts`
