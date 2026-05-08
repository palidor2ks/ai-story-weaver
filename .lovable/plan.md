## Plan

The codebase already contains the intended `Authorization` header fix, but the live logs still show chained calls returning `401 Unauthorized` and no `[Chain] Received chained chunk` messages. That means either the deployed function is still on the old code, or `supabase.functions.invoke()` is still not forwarding the service-role Authorization header during self-invocation.

### 1. Make self-chaining more reliable
- Replace the self-chain `chainClient.functions.invoke('get-candidate-answers', ...)` calls with a direct `fetch()` to:
  `https://<project>.supabase.co/functions/v1/get-candidate-answers`
- Send both required auth headers explicitly:
  - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
  - `apikey: <SUPABASE_SERVICE_ROLE_KEY>`
- Keep the same body payload so the next chunk still runs in background mode.

### 2. Improve diagnostics if it fails again
- When a chain call returns non-2xx, log the HTTP status and response body instead of only the generic `FunctionsHttpError`.
- Add a minimal log that confirms chained requests reached the handler.

### 3. Deploy and verify the edge function
- Deploy `get-candidate-answers` after the code change.
- Check fresh logs for:
  - `[Chain] Received chained chunk ...`
  - `[Background] Self-chain invoked successfully ...`
  - Additional chunks processing beyond the first 5.

### Technical note
The chunk size of 5 is intentional to avoid Edge Function wall-clock limits. The bug is not that it processes 5 at a time; the bug is that the handoff to the next chunk is still being rejected with 401.