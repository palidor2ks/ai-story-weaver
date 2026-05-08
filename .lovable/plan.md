# Fix: Duplicate Questions in Onboarding Quiz Save

## Problem

After marking local questions as `is_onboarding_canonical`, the `useAllCanonicalQuestions` hook fetches ALL canonical questions (federal + local). This means:

1. The federal quiz now includes local questions (34 total instead of 24)
2. The local quiz step asks the same local questions again
3. When saving, `handleComplete` combines both answer arrays, creating duplicate `questionId` entries
4. The `save_quiz_results` RPC crashes with "ON CONFLICT DO UPDATE command cannot affect row a second time"

## Fix

### 1. Filter `useAllCanonicalQuestions` to federal-only

In `src/hooks/useCandidates.ts`, update `useAllCanonicalQuestions` to join with `topics` and filter where `scope != 'local'` (i.e., `scope = 'all'`). This keeps the federal quiz at 24 questions.

Since the Supabase query already uses the `questions` table, we can filter by checking `topic_id` is NOT in the set of local topic IDs. The simplest approach: add a `.not('topic_id', 'like', 'local-%')` filter to exclude local topics.

### 2. Deduplicate answers in `handleComplete` (defensive)

In `src/pages/Onboarding.tsx`, when building `allAnswers`, deduplicate by `questionId` (local answers take priority since they're the user's most recent response). This prevents the crash even if questions overlap for any reason.

```typescript
const allAnswers = [...quizAnswers];
for (const la of localQuizAnswers) {
  const idx = allAnswers.findIndex(a => a.questionId === la.questionId);
  if (idx >= 0) allAnswers[idx] = la;
  else allAnswers.push(la);
}
```

## No database changes needed
