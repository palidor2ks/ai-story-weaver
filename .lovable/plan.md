## Goal
Fix three issues with the Relevant News feed:
1. Article links don't open the actual article (Google News RSS uses redirect URLs).
2. Titles are dirty (trailing " - Source Name", leftover HTML entities).
3. No time-window logic — should show **today** first, then fall back to **this week**, then **this month**, else show "No relevant news".

## Changes

### `supabase/functions/fetch-relevant-news/index.ts`

**1. Resolve real article URLs**
Google News RSS `<link>` is `https://news.google.com/rss/articles/...` which redirects. Two-step fix:
- Prefer the publisher URL embedded in `<description>` (Google News descriptions contain `<a href="https://realsite.com/...">` to the real article). Parse the first `href` from the description HTML and use it as the canonical URL when present.
- Fallback: keep the Google News link (still works, just redirects).

**2. Clean titles**
- Strip trailing ` - <Source>` suffix that Google News appends (e.g. `"Headline - The New York Times"` → `"Headline"`). Use the `<source>` value to trim, plus a generic ` - [^-]+$` fallback when source missing.
- Re-run entity decode after stripping (already have `decodeEntities`).
- Clean snippet: strip all HTML, decode entities, collapse whitespace, cap at 240 chars.

**3. Tiered time window**
Replace single threshold with cascading buckets. After scoring/dedupe:
```text
today    = items with ageHours <= 24
week     = items with ageHours <= 24*7
month    = items with ageHours <= 24*30
```
Pick the **first non-empty bucket** in that order. Return `{ items, window: 'today'|'week'|'month'|'none' }`.

Keep the `score >= 3` + person-match requirement inside each bucket.

### `src/hooks/useRelevantNews.ts`
Update return type to `{ items: FeedNewsItem[]; window: 'today'|'week'|'month'|'none' }`. Keep query options the same.

### `src/components/RelevantNewsFeed.tsx`
- Consume `{ items, window }`.
- Show a small label in the card header: "Today", "This week", "This month", or hide when none.
- Empty state: "No relevant news this month."
- Add `target="_blank" rel="noopener noreferrer"` (already there) — no change needed; just confirm link uses cleaned `url`.

## Out of scope
- No DB writes; no follow-redirect server call (avoids latency + bot blocks). Description-href extraction handles the vast majority of articles.
- No change to scoring weights or query construction.

## Verification
- Curl edge function for a known rep; confirm `items[].url` points to the publisher domain (not `news.google.com`) for most items, titles have no ` - Source` suffix, `window` field present.
- Open Feed page; click 2-3 items, verify they land on the article.
