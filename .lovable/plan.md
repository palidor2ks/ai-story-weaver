## Goal
Add a Google News–powered "Relevant News" feed to the Feed page (above the representatives list) and a per-representative version on the Candidate Profile page. News is filtered to the user's reps/candidates + district, with highlights for the user's top topics and "new in 48h" articles.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│ Client                                                    │
│  - useRelevantNews(hook) ──► supabase.functions.invoke   │
│  - <RelevantNewsFeed/>  renders cards + badges           │
└─────────────────────────┬────────────────────────────────┘
                          │
              ┌───────────▼────────────┐
              │ Edge fn: fetch-relevant│
              │ -news (Deno)           │
              │  1. Build queries from │
              │     people + district  │
              │  2. Fetch Google News  │
              │     RSS (multi-query)  │
              │  3. Parse XML, dedupe  │
              │     by URL+title       │
              │  4. Score: person hit, │
              │     topic hit, recency │
              │  5. Flag isTopTopicHit │
              │     + isNew (≤48h)     │
              │  6. Return top N items │
              └────────────────────────┘
```

## Files

### New
- `supabase/functions/fetch-relevant-news/index.ts` — POST handler. Body: `{ people: {name, office, state, district?}[], topics: string[], district?, state?, limit? }`. CORS enabled, `verify_jwt = false` (no secrets needed; Google News RSS is public). Uses regex XML parsing (no extra deps). Returns `FeedNewsItem[]`.
- `src/hooks/useRelevantNews.ts` — React Query hook. Stable key includes hashed people/topics/district. `staleTime: 15min`, `refetchInterval: 30min`.
- `src/components/RelevantNewsFeed.tsx` — Reusable card list. Props: `people`, `topics`, `district?`, `state?`, `title?`, `maxItems?`. Renders title, source · relative time, snippet, "New" + "Top Topic Match" badges, matched-topic chips. Loading skeletons + empty state.

### Edited
- `src/pages/Feed.tsx` — Insert `<RelevantNewsFeed>` above the representative list. Feed it the unified candidates already on screen (myReps + district candidates) and `userTopics`.
- `src/pages/CandidateProfile.tsx` — Add a "Latest News" section in the profile (near the top, under header). Pass a single-person array `[{name, office, state, district}]` and `userTopicScores` topic names.

## Scoring (edge function)
- person match: full name +3, last name + chamber/office keyword +2
- district mention (e.g., "NJ-06", "California 12th") +2
- topic keyword hit +1 each (capped at +3)
- recency: ≤24h +2, ≤72h +1
- dedupe: lowercase host+path; keep highest score
- `isTopTopicHit = matchedTopics.length > 0`
- `isNew = publishedAt within 48h`
- threshold: keep score ≥ 3, sort desc, slice `limit ?? 20`

## Out of scope
- No DB writes, no "seen articles" persistence (the 48h window approximates "new").
- No per-rep `rss_url` integration yet (Google News RSS only).
- No paid news API; can swap in later behind same hook.

## Verification
- Edge function curl test with sample people/topics returns parsed items.
- Feed page renders news section above reps; Candidate Profile shows scoped news; topic highlights visible.
