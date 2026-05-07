
# Fix Background Research Timeout for Long-Running Jobs

## Problem
Joe Danielsen's "Regenerate Topics" queued 20 questions for background deep research. Each question uses Perplexity `sonar-deep-research` which takes 2-5 minutes. The edge function was killed by Supabase's wall-clock limit (~400s) after completing only 6 questions, leaving 14 stuck forever. The client polls indefinitely showing "6/20 complete."

## Root Cause
`EdgeRuntime.waitUntil()` extends processing beyond the HTTP response, but Supabase still enforces a hard wall-clock limit. 20 questions × ~3 min = ~60 min, far exceeding the limit.

## Fix: Chunked Background Processing with Self-Chaining

### 1. Chunk background work in `get-candidate-answers/index.ts`
Instead of processing all missing questions in one `waitUntil` call:
- Process questions in chunks of **5** per edge function invocation
- After each chunk completes, the function **self-invokes** to process the next chunk
- Each invocation stays well within the wall-clock limit (~15-25 min for 5 questions)

### 2. Add stale job detection in `BackgroundProcessingContext.tsx`
- If a job hasn't progressed (same `completedCount`) for **10 minutes**, mark it as "stalled"
- Show a "Retry" button in the UI for stalled jobs
- Auto-dismiss jobs stalled for 30+ minutes

### 3. Add resume capability
- When "Regenerate Topics" is clicked for a candidate that already has partial answers, only generate missing ones (already works via `forceRegenerate: false`)
- The user can simply click "Regenerate" again for Danielsen and it will pick up the remaining 14 questions

## Technical Details

**Chunk self-chaining in edge function:**
```
// After processing chunk of 5:
if (remainingQuestionIds.length > 0) {
  // Self-invoke for next chunk
  fetch(`${SUPABASE_URL}/functions/v1/get-candidate-answers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ... },
    body: JSON.stringify({ candidateId, questionIds: nextChunkIds, ... })
  });
}
```

**Stale detection in BackgroundProcessingContext:**
- Track `lastProgressAt` timestamp per job
- If `Date.now() - lastProgressAt > 10 * 60 * 1000` and not complete, mark stalled
- Show retry action or auto-clear after 30 min

## Files Changed
1. `supabase/functions/get-candidate-answers/index.ts` — Add chunk size limit and self-chaining
2. `src/context/BackgroundProcessingContext.tsx` — Add stale job detection and auto-cleanup
3. `src/components/admin/ProcessingStatusIndicator.tsx` — Show "Stalled" state with retry button
