## Problem

The `get-candidate-answers` edge function uses `sonar-deep-research` which takes ~60s per question. The platform kills the function at ~6 minutes (wall_clock), but answers are only saved in batches of 10. Since only 5-7 questions complete before shutdown, **zero answers are ever saved**.

The function already skips existing answers on retry (line 1253-1254), so if we save incrementally, re-clicking "Regenerate Topic" would resume from where it left off.

## Fix

**Single change in `supabase/functions/get-candidate-answers/index.ts`** (~lines 957-998):

Save each answer immediately after generation instead of accumulating and saving every 10. This way:
- Each ~60s research call produces a persisted result
- If shutdown occurs at question 6, questions 1-5 are saved
- Re-clicking "Regenerate Topic" picks up at question 6

The `generateAnswersForCandidate` function loop will call `saveAnswersBatch` with a single answer after each successful research, replacing the current `if (answers.length % 10 === 0)` batch logic.

## Impact

- No schema changes needed
- No frontend changes needed  
- The existing background polling in the client will start seeing incremental progress (1/20, 2/20...) instead of stuck at 0/20
