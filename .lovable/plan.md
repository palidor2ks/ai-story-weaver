## Goal
Apply PR #121 so FEC committee sync cursors are scoped to the selected receipt cycle. A cursor saved while syncing the 2024 receipt period must not be reused (or counted as "complete") when the admin runs a 2026 receipt sync.

## Changes

1. **New migration** `supabase/migrations/<timestamp>_track_committee_sync_receipt_cycle.sql`
   - `ALTER TABLE public.candidate_committees ADD COLUMN IF NOT EXISTS last_cycle text;`
   - `CREATE INDEX IF NOT EXISTS idx_candidate_committees_last_cycle ON public.candidate_committees(candidate_id, last_cycle);`

2. **Edge function** `supabase/functions/fetch-fec-donors/index.ts`
   - Add `lastCycle?: string | null` and `hasMore?: boolean` to the in-memory committee sync info type and merge logic.
   - Select `last_cycle, has_more` in both `candidate_committees` queries and store them on the map.
   - Replace the "needs sync" check so completion/cursor only count when `cmte.lastCycle === cycle`; otherwise treat as needing sync.
   - When resuming, only use the saved `lastIndex`/`lastContributionDate` if `targetCommittee.lastCycle === cycle`; log when ignoring a stale cursor.
   - Gate the "load existing donors to continue accumulation" branch on the same cycle-match condition.
   - Write `last_cycle: cycle` alongside `last_index`/`has_more` when persisting the committee row.

3. **Hook** `src/hooks/useCandidatesAnswerCoverage.ts`
   - Select `last_cycle` on the `candidate_committees` query.
   - Skip rows whose `last_cycle !== FINANCE_CYCLE` from sync-status derivation (P/A committees only).
   - Only mark `completeSyncMap[candidate_id] = true` when `last_sync_completed_at` is set AND `has_more !== true`.

4. **Admin panel docs** `src/components/admin/AnswerCoveragePanel.tsx`
   - Fix the JSDoc cycle ranges: `Cycle 2026 = Jan 1, 2025 – Dec 31, 2026`, `Cycle 2024 = Jan 1, 2023 – Dec 31, 2024`.

## Notes
- Migration is additive (`IF NOT EXISTS`), safe on existing data. Rows with `last_cycle IS NULL` will simply be treated as "not yet synced for this cycle", which is the correct behavior for legacy cursors.
- No grants needed (column added to existing table; RLS unchanged).
- The Supabase preview-branch error noted on the PR (`candidate_committees_candidate_id_fkey already exists`) is unrelated to this migration — it's a pre-existing FK migration that fails on the preview branch only.

## Verification
- `npx tsc --noEmit` should be clean.
- Manually: run a 2026 receipt sync on a candidate whose committees were last completed for 2024 → cursor is ignored, fresh pagination starts, log shows "Ignoring saved cursor … does not match requested receipt cycle 2026".
- Admin coverage panel: a candidate fully synced for 2024 should NOT show as "complete" when the cycle selector is set to 2026.
