
## Problem

Every time `useCandidatesAnswerCoverage` or `useCandidateAnswerStats` runs their `queryFn`, they each independently:

1. Fetch federal topic IDs from `topics` table (1 query)
2. Count all questions (1 query)
3. Count federal-only questions (1 query)

That's **3 redundant queries per hook invocation** for data that almost never changes (topics and question counts are effectively static during a session). When the coverage hook refetches due to filter changes, it re-fetches these counts every time even though they haven't changed.

### Current impact

| Query | When it runs | Cost |
|-------|-------------|------|
| `topics.select('id').eq('scope','all')` | Every queryFn call in both hooks | ~50ms round-trip |
| `questions.select(count).head()` (all) | Every queryFn call in coverage hook | ~50ms round-trip |
| `questions.select(count).head().in(topic_id)` | Every queryFn call in both hooks | ~50ms round-trip |

With progressive loading (initial + full load), the coverage hook runs its queryFn **twice**, so that's 6 unnecessary queries just for topic/question metadata. Add `useCandidateAnswerStats` and it's 9 total queries for data that could be fetched once.

### Real-world effect

- **~150-300ms wasted per admin page load** on redundant Supabase round-trips
- Filter changes (party, state) trigger full refetches including these static counts
- Progressive loading doubles the waste since initial + full queries both re-fetch

## Proposed fix

1. **Extract a shared `useQuestionCounts` hook** that fetches federal topic IDs and both question counts, cached via React Query with a long `staleTime` (5 minutes).

2. **Both hooks consume `useQuestionCounts`** instead of fetching their own copies. Their `queryFn` receives the cached values, eliminating 2-3 queries per invocation.

3. The new hook returns `{ federalTopicIds, federalQuestions, allQuestions, isLoading }`.

### Technical details

**New: `useQuestionCounts` (in same file)**
```ts
function useQuestionCounts() {
  return useQuery({
    queryKey: ['question-counts'],
    staleTime: 5 * 60 * 1000, // 5 min — topics/questions rarely change
    queryFn: async () => {
      const { data: federalTopics } = await supabase
        .from('topics').select('id').eq('scope', 'all');
      const federalTopicIds = (federalTopics || []).map(t => t.id);
      const [allQ, fedQ] = await Promise.all([
        supabase.from('questions').select('*', { count: 'exact', head: true }),
        supabase.from('questions').select('*', { count: 'exact', head: true })
          .in('topic_id', federalTopicIds),
      ]);
      return {
        federalTopicIds,
        allQuestions: allQ.count || 0,
        federalQuestions: fedQ.count || 0,
      };
    },
  });
}
```

**Modified: `useCandidatesAnswerCoverage`**
- Add `useQuestionCounts()` call at top
- Remove lines 160-173 (inline topic/question fetching)
- Use cached values from the shared hook
- Add `enabled: !!questionCounts` to avoid running before counts are ready

**Modified: `useCandidateAnswerStats`**
- Same pattern — consume `useQuestionCounts()` instead of fetching its own copy

### What does NOT change

- No database schema changes
- No API changes
- No visible UI changes
- All existing filtering, progressive loading, and display logic stays the same
- The denominator logic (240 for federal, 340 for local) is preserved exactly
