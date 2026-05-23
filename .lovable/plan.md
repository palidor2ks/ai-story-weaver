# Improve news topic/question accuracy

## Problem

In `fetch-relevant-news`, every fetched article is attached to **every** candidate question (`news_article_questions` insert loops over all `questionIds` with no relevance check). Topic matching is a literal substring scan against title+snippet, so most articles end up with `matched_topics = []`. At display time the UI picks an arbitrary question, which is why a horse-race story about Vance abandoning 2028 is labeled "Economy → Should the federal government increase regulation of large corporations?".

## Fix

### 1. Add AI classification step (`fetch-relevant-news`)

For each chosen article (the small `sliced` array, max ~5–10), call Lovable AI Gateway (`google/gemini-3-flash-preview`, tool-calling for structured output) once with:
- Article title + snippet
- The candidate's allowed topic list (12 federal or 5 local, per scope memory)
- The candidate's question list (`id`, `text`, `topic_name`)

Return:
```
{
  "is_policy_relevant": boolean,
  "topic_id": string | null,        // must be one of provided topic_ids, else null
  "question_ids": string[],         // 0–2 best-matching question IDs, empty if none
  "confidence": "high" | "medium" | "low"
}
```

Rules baked into the prompt:
- Horse-race / campaign-strategy / personnel stories → `is_policy_relevant=false`, no topic, no question.
- Only emit `question_ids` when the article clearly evidences a candidate position or action on that specific question.
- Confidence `low` → drop the topic/question from display.

### 2. Replace blanket persistence

In the `EdgeRuntime.waitUntil` block (lines 711–751):
- Insert into `news_articles` as today.
- Insert into `news_article_questions` **only** for the AI-returned `question_ids` (0–2 rows, not N).
- Insert into `question_news_feed_cache` for the AI-returned question(s); if none, still cache the article under a synthetic "no-question" path so it can render without a label (option: add nullable `question_id` cache path, or simply skip cache and rely on the live feed for unlabeled articles — recommend the latter to avoid schema churn).

### 3. Display-time guardrails

- In the response mapper (lines 698–708) and the cached path (lines 562–586), only set `topicLabel` / `relatedQuestion` when they came from the AI classifier (high/medium confidence). Otherwise omit both fields.
- Frontend `NewsCard` (or equivalent) already renders the badges conditionally on those fields, so no UI change needed — they just disappear when absent.

### 4. One-time backfill / cleanup

New SQL migration to clear the bad mappings so the cache stops serving them:
```sql
DELETE FROM public.question_news_feed_cache
 WHERE article_id IN (
   SELECT id FROM public.news_articles WHERE published_at > now() - interval '60 days'
 );
DELETE FROM public.news_article_questions
 WHERE matched_topics = '{}'::text[];
```
(Keeps older curated rows; forces fresh classification on next fetch.)

### 5. Cost / latency note

Adds one AI call per fetch cycle per candidate (batched across ~5–10 articles in a single request). Cached path stays free. With existing `fetch-relevant-news` cache TTL the per-user cost is negligible.

## Files touched

- `supabase/functions/fetch-relevant-news/index.ts` — add classifier, replace persistence loop, guard display fields.
- New migration — purge stale mappings.

## Out of scope

- No changes to the news fetch sources, ranking score, dedup, or window logic.
- No changes to `questions`, `topics`, or candidate position pipeline.
- No UI changes beyond the badges naturally hiding when fields are absent.
