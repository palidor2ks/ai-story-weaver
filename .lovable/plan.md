## Why AI analysis is not working

Based on the current signals:

- The old 500 parse error came from Jina DeepSearch returning markdown narrative instead of JSON.
- The latest edge logs no longer show new parse errors after the backend patch; only boot events appear after deployment.
- The browser session shows the modal stays on “Generating analysis…” and the user closes it after ~30 seconds.
- Browser network history from the debugging session did not show a completed `ai-donor-analysis` request, which suggests either the call is long-running, not being captured from the user session, or the UI gives no timeout/progress/error while Jina is still researching.

The most likely current problem is that the donor analysis function is taking too long because it calls Jina DeepSearch first, then may call Lovable AI to structure the result. The frontend waits indefinitely enough to look broken.

## Implementation plan

1. **Backend timeout guard**
   - Add an `AbortController` timeout around the Jina DeepSearch fetch in `ai-donor-analysis` and `ai-recipient-analysis`.
   - If Jina exceeds a reasonable limit, return a clean JSON response with `fallback: true` and a user-friendly timeout message instead of hanging.

2. **Avoid unnecessary second AI call**
   - Keep the direct JSON parser.
   - If Jina returns narrative, use the existing narrative fallback immediately when needed so the function can still return results without waiting on another model whenever structuring is unreliable or slow.
   - Optionally keep tool-calling structuring only if it completes quickly.

3. **Frontend loading timeout and clearer state**
   - Add a client-side timeout for `DonorAIAnalysisDialog` and `RecipientAIAnalysisDialog` so the modal stops spinning and shows a retryable message if the request takes too long.
   - Preserve the retry button behavior.

4. **Validation**
   - Run Deno checks for both edge functions.
   - Redeploy both functions.
   - Re-check edge function logs for timeout/parse errors after deployment.

## Expected result

The AI analysis modal should no longer appear stuck. It will either show a structured/narrative analysis, or a clear retryable timeout/service message rather than an endless “Generating analysis…” state.