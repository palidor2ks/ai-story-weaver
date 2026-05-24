# Improve Relevant News Quality & Freshness (PR #81, fixed)

Implement the three goals from upstream PR #81 in `supabase/functions/fetch-relevant-news/index.ts`, but avoid the two Codex review problems (P1 cache-key mismatch and P2 top-story sort happening after truncation).

All changes are confined to `supabase/functions/fetch-relevant-news/index.ts`.

## Changes

### 1. Add Google News top-stories source
- Add `fetchGoogleTopStories()` that fetches `https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en` and parses it with the existing RSS parser.
- Merge its results into the candidate pool alongside `bingItems` and `gdeltItems`.
- Tag each parsed top-story `ParsedItem` with an internal `_isTopStory = true` flag (carry it through to the `FeedNewsItem`).

### 2. Tighten output to require topic + question
- After classification, only keep items where both `topicLabel` and `relatedQuestion` are present (`qualifiedItems`).
- Use `qualifiedItems` for both the response payload and the cache persistence loop.

### 3. Extend cache freshness — without the P1 staleness bug
Codex P1: extending TTL while the cache lookup is only keyed by `question_id` returns context-mismatched results across different `people` / `state` / `district`.

Fix: extend `freshnessCutoff` to 48 hours **and** scope the cache hit to the current request context:
- After fetching cached rows by `question_id`, filter in memory so an article only counts as a cache hit when at least one of its `matched_people` (stored in `news_article_questions`) overlaps with the current request's `people` names (case-insensitive).
- If no rows survive that filter, fall through to the live fetch path instead of returning stale cross-context items.
- Keep `last_seen_at` / `rank_score` ordering; only the freshness window and the in-memory people filter change.

### 4. Prioritize top stories before applying the limit — fix P2
Codex P2: the top-story sort runs after `chosen.slice(0, limit)` so promotions cannot cross the cutoff.

Fix:
- Sort `chosen` with `_isTopStory` as the primary key (top stories first), then `relevanceScore`, then `publishedAt` — **before** `chosen.slice(0, limit)`.
- Remove any post-slice top-story re-sort so the ranking is decided once, pre-truncation.

## Technical notes
- `_isTopStory` is an internal flag only; strip it (alongside the existing `_classifiedQuestionIds` / `_classifiedTopicId`) before responding.
- Cache people-overlap filter reads `matched_people` from the existing `news_article_questions` select; no schema change.
- 48h cutoff constant: `new Date(Date.now() - 48 * 36e5).toISOString()`.
- No migrations, no other files touched.

## Verification
- Type-check via the standard build (Deno check is unavailable in-sandbox, same as upstream PR).
- Smoke: confirm cached path only returns when `matched_people` overlaps current request; confirm top-story tagged items appear above same-score non-top items after slicing.
