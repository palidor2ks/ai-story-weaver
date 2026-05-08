## Problem

`get-candidate-answers` processes questions in chunks of 5, then self-chains for the next chunk. The self-chain call returns **401 Unauthorized**, so only the first 5 questions are ever processed per request.

Cause: the chained call uses `createClient(url, SERVICE_ROLE_KEY).functions.invoke(...)`, but `supabase-js` does not automatically attach the service role as the `Authorization: Bearer ...` header — it only sends `apikey`. The handler's auth gate (`token === SUPABASE_SERVICE_ROLE_KEY`) therefore rejects the request.

## Fix

In `supabase/functions/get-candidate-answers/index.ts`, change both self-chain invocations (the success path around line 1149 and the recovery path around line 1178) to explicitly pass the `Authorization` header with the service role key:

```ts
const { error: chainError } = await chainClient.functions.invoke('get-candidate-answers', {
  headers: {
    Authorization: `Bearer ${supabaseKey}`,
  },
  body: { candidateId, questionIds: remainingIds, forceRegenerate: true, useBackground: true, _isChainedChunk: true },
});
```

That makes the receiving handler see `Bearer <SERVICE_ROLE_KEY>`, which matches its `isServiceRole` check, and the chain continues until `remaining.length === 0`.

## Optional follow-up (not required to unblock)

- Add a small `await new Promise(r => setTimeout(r, 250))` before chaining to ensure the prior background `EdgeRuntime.waitUntil` work has flushed DB writes.
- Increase `CHUNK_SIZE` from 5 to 8 if wall-clock budget allows, to reduce chain hops. Keep at 5 if Perplexity quota issues are common (logs show repeated 401s from Perplexity falling back to Gemini, which slows each question).

## Out of scope

- The Perplexity 401 (`exceeded your current quota`) is a separate billing issue and is not what's blocking the chunking. Gemini fallback already handles it.

## Verification

1. Trigger answer generation for a candidate with >5 missing questions.
2. Watch edge function logs — should see repeated `[Background] Self-chain invoked successfully` and `[Chain] Received chained chunk` until all questions are saved.
3. Confirm `candidate_answers` row count for that candidate equals total expected questions.
