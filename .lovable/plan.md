
# Fix dropdown + sparkle button not updating

## Root cause
`useUpsertCommitteeTopic` and `useDeleteCommitteeTopic` in `src/hooks/useCommitteeTopics.ts` invalidate the old query keys (`committee-topics-all`, `committee-topics-map`). The new paginated panel reads from `['committee-pool', ...]`, which is never invalidated — so picking a cause or clearing it silently writes to the DB but the row never refreshes (it looks like "nothing happens").

The sparkle (re-run AI) button calls the edge function successfully but, same issue, the page doesn't refetch.

## Fix
1. Add `qc.invalidateQueries({ queryKey: ['committee-pool'] })` to both `useUpsertCommitteeTopic.onSuccess` and `useDeleteCommitteeTopic.onSuccess`.
2. In `CommitteeTopicsPanel.tsx`, after a successful single-row `handleClassifyOne`, invalidate `['committee-pool']` so the new AI assignment shows immediately.

## Files
- `src/hooks/useCommitteeTopics.ts`
- `src/components/admin/CommitteeTopicsPanel.tsx`
