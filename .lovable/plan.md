## Problem

Both "Run now" buttons in the Automated Jobs card fail instantly with `Failed to send a request to the Edge Function`. The `schedule-congress-donor-sync` edge function logs show the real cause:

```
TypeError: supabase.rpc(...).catch is not a function
  at index.ts:85
```

Source line 68:
```ts
const { data: lockRow } = await supabase
  .rpc('pg_try_advisory_lock' as never, { key: lockKey } as never)
  .catch(() => ({ data: null }));
```

The Supabase query builder is a thenable, not a real Promise — chaining `.catch()` directly on it throws synchronously, which crashes the handler before any sync work begins. The `lockRow` value was already unused (`void lockRow` on line 71), so the call is dead weight on top of being broken.

## Fix

In `supabase/functions/schedule-congress-donor-sync/index.ts`:

1. Remove the broken `supabase.rpc('pg_try_advisory_lock', ...).catch(...)` line entirely along with the now-orphaned `void lockRow` and `lockKey` setup. The comment on line 70 already states we rely on cron not stacking, so no replacement is needed.
2. Verify no other `.catch()` is chained directly to a non-awaited Supabase builder in this file.

## Verification

- Click "Run now" → Backfill in the Admin → Donor Import tab. Expect the diagnostics panel to populate with per-candidate rows, missing-FEC list, and totals.
- Click "Run now" → Daily Refresh. Same expected result.
- Check `schedule-congress-donor-sync` logs to confirm no TypeError and that the function returns 200.

No UI, schema, or business-logic changes — just the broken lock call removed.