## Goal
Show only news articles that have a real publisher URL, and fix the URL resolution so articles are clickable instead of becoming unclickable rows.

## Plan
1. Update `supabase/functions/fetch-relevant-news/index.ts`
   - Remove the old Google search fallback entirely.
   - Improve Google News URL resolution by:
     - decoding Google RSS article tokens when possible,
     - following Google News redirects from the edge function when decoding fails,
     - rejecting any final `google.com` / `news.google.com` URL.
   - After resolution, filter out unresolved items before returning results.
   - If Google RSS produces too few clickable items, merge in GDELT publisher URLs as a backup source instead of returning unclickable Google items.

2. Update `src/components/RelevantNewsFeed.tsx`
   - Revert the non-clickable row behavior.
   - Render every returned item as a normal clickable article link.
   - Since the edge function will only return valid URLs, no unclickable articles will display.

3. Update `src/hooks/useRelevantNews.ts` if needed
   - Keep the item type requiring `url: string`, matching the new guarantee that displayed news items are clickable.

4. Validate
   - Deploy/test `fetch-relevant-news`.
   - Confirm returned `items[]` all have non-empty URLs.
   - Confirm no returned URL contains `google.com` or `news.google.com`.
   - Confirm the feed still shows articles and all visible rows are clickable.