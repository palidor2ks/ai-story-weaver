Fix the remaining blocked Google links in the news feed.

What I found:
- Some feed items still intentionally fall back to `https://www.google.com/search?...&tbm=nws` when the original publisher URL cannot be resolved.
- Those Google search/news links can still be blocked when opened from the embedded preview or browser context.

Plan:
1. Update `supabase/functions/fetch-relevant-news/index.ts` so returned news items never use Google URLs as clickable article URLs.
   - Keep decoded publisher URLs when available.
   - Keep GDELT publisher URLs when available.
   - If Google News cannot be resolved to a publisher URL, return the item with no URL or a non-clickable marker instead of `google.com/search`.

2. Update `src/hooks/useRelevantNews.ts` typing to allow a missing/empty URL for unresolved news items.

3. Update `src/components/RelevantNewsFeed.tsx` so:
   - Items with publisher URLs remain clickable.
   - Items without publisher URLs display normally but are not clickable and do not show the external-link affordance.
   - No raw link text is shown.

4. Deploy and test `fetch-relevant-news` with the current Feed data.
   - Verify no returned `items[].url` contains `google.com` or `news.google.com`.
   - Verify the feed still displays articles.
   - Verify clickable articles open publisher sites, not blocked Google pages.