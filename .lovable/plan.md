
## Problem

"Regenerate Topic" fails for two reasons found in the edge function logs:

### 1. Perplexity API quota exhausted
The Perplexity API key has exceeded its quota. Every research call returns `401 insufficient_quota`. This affects **all** candidates, not just civic officials.

**Fix:** You need to add credits to your Perplexity account at https://www.perplexity.ai/settings/api. No code change needed for this — it's a billing issue.

### 2. Foreign key constraint blocks civic officials
`candidate_answers` has a FK `candidate_answers_candidate_id_fkey` pointing to `candidates.id`. Civic officials (openstates_*, nj_*, etc.) only exist in `candidate_overrides`, not in `candidates`. So even when Perplexity returns valid answers, saving them fails with:

```
insert or update on table "candidate_answers" violates foreign key constraint "candidate_answers_candidate_id_fkey"
```

**Fix:** Drop the FK constraint so `candidate_answers.candidate_id` can reference either `candidates` or `candidate_overrides` records.

### Changes

1. **Migration: Drop the FK constraint** on `candidate_answers.candidate_id → candidates.id`. This allows storing answers for civic officials who only exist in `candidate_overrides`.

2. **Migration: Drop the FK constraint** on `candidate_answers.question_id → questions.id` is NOT needed (questions are shared). Only the candidate FK is the issue.

No edge function or frontend code changes needed — the code already works correctly, it's just blocked by the database constraint and the exhausted API quota.
