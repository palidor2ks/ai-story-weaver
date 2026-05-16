## Goal
Apply the changes from `palidor2ks/ai-story-weaver#54` to this project. That PR threads a `questionIds` parameter through the Relevant News flow and adds a Supabase-backed cache so repeated reads serve from cached articles instead of refetching Bing/GDELT every time.

I verified that this project's `RelevantNewsFeed.tsx`, `useRelevantNews.ts`, and `fetch-relevant-news/index.ts` currently match the PR's "before" state, so the diff applies cleanly.

## Changes

### 1. `src/components/RelevantNewsFeed.tsx`
- Add optional `questionIds?: string[]` to `Props` (default `[]`).
- Pass it through to `useRelevantNews`.

### 2. `src/hooks/useRelevantNews.ts`
- Add `questionIds?: string[]` to `Args` (default `[]`).
- Include a sorted-joined `questionIds` key in the React Query `queryKey` so different question sets get separate cache entries.
- Forward `questionIds` in the edge function `body`.

### 3. `supabase/functions/fetch-relevant-news/index.ts`
- Import `createClient` from `npm:@supabase/supabase-js@2` and instantiate with service-role key.
- Accept `questionIds?: string[]` in `RequestBody`.
- Add a `resolveQuestionIds()` helper that:
  - Seeds from explicit `questionIds`.
  - Adds every question whose `topic_id` is in the request's topics (when topics look like UUIDs).
- If no questions resolved, short-circuit with empty result.
- Before fetching live news, query `question_news_feed_cache` joined with `news_articles` for any row with `last_seen_at` within 30 minutes; if results exist, return them mapped to the existing `FeedNewsItem` shape and skip network fetches.
- After a live fetch, upsert each item into `news_articles`, then upsert one row per `questionId` into both `news_article_questions` (relevance + matched arrays) and `question_news_feed_cache` (rank score + window label + `last_seen_at = now()`).

### 4. New migration `supabase/migrations/<new-timestamp>_news_article_question_cache.sql`
Create three tables (idempotent `create table if not exists`):

- `news_articles(id uuid pk, url unique, title, source, published_at, snippet, created_at)`
- `news_article_questions(article_id → news_articles, question_id → questions, relevance_score int, matched_people text[], matched_topics text[], linked_at, pk(article_id, question_id))`
- `question_news_feed_cache(question_id → questions, article_id → news_articles, rank_score int, window_label text check in ('today','week','month','none'), last_seen_at, pk(question_id, article_id))`

Plus the three indexes from the PR (`news_articles.published_at desc`, `news_article_questions.question_id`, `question_news_feed_cache.last_seen_at desc`).

Also enable RLS on all three tables with admin-only read/write policies (PR omitted RLS; this project's convention requires it — these tables hold no user-specific data but should still be locked down at the table level, with the edge function using the service-role key to bypass).

## Skipped from the PR
- The two edits to already-applied migration files (`20251230170055_*.sql` adding `IF NOT EXISTS` around the FK, and `20251231030626_*.sql` adding `DROP FUNCTION IF EXISTS` lines). Both are idempotency safety nets for re-running migrations; they have no runtime effect on this project where the migrations already ran successfully. Including them as new migrations would be a no-op or, worse, drop+recreate live RPCs unnecessarily.

## Out of scope
- No callsite changes — `questionIds` is optional with `[]` default, so existing `<RelevantNewsFeed />` usages keep working unchanged. (If you want me to wire `questionIds` from a specific page that has question context, say which page and I'll add it.)
- No changes to the news ranking, query building, or windowing logic.
