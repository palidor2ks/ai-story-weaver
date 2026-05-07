
# Fix Self-Chain 401 Error in get-candidate-answers

## Problem
When `get-candidate-answers` finishes processing a chunk of 5 questions, it tries to self-invoke via `fetch()` using `SUPABASE_SERVICE_ROLE_KEY` as the Bearer token. The Lovable gateway rejects this with HTTP 401 because it uses a signing-key auth system — the service role key is not a valid Bearer token for edge function invocation.

Result: Only the first chunk of 5 questions gets processed. The remaining 15 questions are never started. Joe Danielsen processed 5/20 local questions before stalling.

## Fix

Change the self-chaining mechanism to use the Supabase JS client's `functions.invoke()` method, which properly handles Lovable's auth system.

### File: `supabase/functions/get-candidate-answers/index.ts`

Replace the raw `fetch()` self-chain calls (lines ~1149-1168 and ~1182-1195) with:

```typescript
const chainClient = createClient(supabaseUrl, supabaseKey);
const { error: chainError } = await chainClient.functions.invoke('get-candidate-answers', {
  body: {
    candidateId,
    questionIds: remainingIds,
    forceRegenerate: true,
    useBackground: true,
    _isChainedChunk: true,
  },
});
if (chainError) {
  console.error(`[Background] Self-chain failed:`, chainError);
} else {
  console.log(`[Background] Self-chain invoked successfully for ${remaining.length} remaining questions`);
}
```

Do the same for the error-recovery chain block.

Also update the auth check (line ~1218) — the `isServiceRole` comparison is no longer needed since Lovable's gateway handles auth. Simplify to just validate via `getUser()` for browser-initiated calls, and allow `_isChainedChunk` requests that pass gateway auth.

### Verification
- Deploy the updated function
- Check logs to confirm self-chain no longer returns 401
