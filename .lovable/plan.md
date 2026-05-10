## Refresh Elections Button

Add a refresh button to the `UpcomingElectionsCard` header that re-runs the upcoming-elections fetch and bypasses the 24h server cache.

### Changes

1. **Edge function `fetch-upcoming-elections`** — accept optional `force: boolean` in the request body. When `true`, skip the `cached`/`CACHE_TTL_HOURS` check and always re-fetch from FEC + Google Civic, then upsert.

2. **Hook `useUpcomingElections`** — expose a `refresh()` helper that:
   - Invokes the function with `{ force: true }` (single ad-hoc invoke, not via React Query's `queryFn`).
   - On success, calls `queryClient.invalidateQueries(['upcoming-elections', ...])` so the UI re-reads fresh data and resumes its normal polling.
   - Tracks an `isRefreshing` boolean for the button spinner.

3. **`UpcomingElectionsCard`** — add a small ghost icon button (`RefreshCw` from lucide) in the `CardHeader` next to the title. Disabled while `isRefreshing` or `isLoading`; spins while refreshing. Shows a toast (success/error) using the existing `useToast` hook.

### Out of scope

- Admin-wide cron pre-warm button (separate `sync-upcoming-elections` function already exists).
- Changing the 24h TTL itself.