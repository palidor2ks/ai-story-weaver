
## Problem

Mikie Sherrill was inaugurated as NJ Governor on Jan 20, 2026, with Dale Caldwell as Lt. Governor. However, Open States API either hasn't updated or has incorrect data — it returns Caldwell with a "Governor" title and may not include Sherrill at all. This means your civic officials list is **incomplete/wrong** for NJ executive officials.

This isn't a code bug — it's an **upstream data staleness** issue with Open States. Your code correctly queries the API and filters by title, but the API has bad data.

## Proposed Fixes

### Fix 1: Add Sherrill via the official_transitions table (quick fix)
Use the existing `official_transitions` system to add Mikie Sherrill as the incoming NJ Governor and correct Dale Caldwell to Lt. Governor. This data is already supported by the `applyTransitions()` function in your edge function. This is the fastest path to correcting the data.

### Fix 2: Improve executive fallback (longer-term)
Add a secondary data source for state governors — e.g., scrape the National Governors Association (NGA) list or use a static config for the 50 governors. This ensures governor data is accurate even when Open States lags behind elections.

### Fix 3: Log all excluded executives for debugging
Currently the code silently skips non-"governor" titled executives. Add logging to show which executives were returned but filtered out, so you can spot data issues faster.

## Recommendation

Start with **Fix 1** (add transition records to correct the data immediately) + **Fix 3** (add debug logging). Fix 2 can be done later as a more robust solution.
