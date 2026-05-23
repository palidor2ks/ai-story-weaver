## Plan

1. **Make the pool query refetch real data after changes**
   - Update `useCommitteePool` so committee pool requests do not stay fresh after assignment changes.
   - Keep prior-page placeholder behavior, but remove the 30-second freshness window that can prevent visible updates.

2. **Force a refresh after mutations complete**
   - In `CommitteeTopicsPanel.tsx`, after a dropdown assignment, clear action, or single-row AI run succeeds, explicitly refetch active `committee-pool` queries instead of only marking them stale.
   - Add success/error feedback for the dropdown and clear actions so failed writes are visible instead of appearing like “nothing happened.”

3. **Refresh after background/bulk actions**
   - After “Run AI on unassigned” returns a processed result, refetch the pool immediately.
   - If the function returns a queued/background job, show that it is queued and keep the manual Refresh pool action as the way to pull finished results.

4. **Address the deeper backend cause if needed**
   - The pool is backed by `committee_pool_mv` but assignment fields are joined live from `committee_topics`, so dropdown/AI changes should not require refreshing the materialized view.
   - If immediate refetch still does not show changes, the next database fix would be changing `list_committee_pool` from `STABLE` to `VOLATILE` to avoid transaction-level result caching in the RPC path.