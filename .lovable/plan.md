
# Fix Feed to only show user's representatives

## Problem

My previous change to fix the Trump duplicate inadvertently added ALL database candidates into the Feed. The Feed should only show representatives relevant to the user's address (zip code).

## Fix

Restore the Feed's original behavior: only show Congress API members + Civic API officials (which are already filtered by the user's address). Use DB candidates only as a fallback when no API data is available.

Keep the name-based deduplication logic so that when a DB candidate matches a civic/congress official by name, the DB version (with scores) is preferred — but only for candidates that already appear in the user's API results.

### Changes to `src/pages/Feed.tsx`

In the combine step, instead of dumping all DB candidates first:
1. First merge congress + civic candidates (these are address-filtered)
2. Then, for each merged candidate, check if a DB candidate exists with the same normalized name — if so, swap in the DB version (for better score data)
3. Only fall back to showing all DB candidates if no API data is available at all
