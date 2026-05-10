## Why candidates dropped

Edge logs for `fetch-civic-officials` show:

```
ERROR Error: authHeader is not defined
```

This started right after the recent commit "Removed stale auth from civic funcs" (and the follow-up "Removed auth gate from fetch"). When the inbound auth gate was deleted, the local `const authHeader = req.headers.get('Authorization')` was deleted with it — but two later references were left behind:

- `supabase/functions/fetch-civic-officials/index.ts:1185` → `EdgeRuntime.waitUntil(persistAndResearchOfficials(allOfficials, authHeader))`
- `supabase/functions/fetch-civic-officials/index.ts:835` → uses it as the `Authorization` header when calling `get-candidate-answers`

The reference at line 1185 throws a synchronous `ReferenceError` inside the `try` block right after results are computed, so the function bails before returning the full `{ federalExecutive, stateExecutive, stateLegislative, local }` payload. The frontend then renders only what it can build from `fetch-representatives` (Congress section), making the page look like it "lost candidates."

## Fix

Re-introduce a safe local auth header inside the `serve` handler and pass it through unchanged:

1. In `supabase/functions/fetch-civic-officials/index.ts`, at the top of the `try` block (right where the old auth gate used to live), add:
   ```ts
   const authHeader = req.headers.get('Authorization') ?? '';
   ```
   No 401 — the public endpoint stays public; the header is only forwarded if the caller happened to be logged in.

2. Leave line 1185 (`persistAndResearchOfficials(allOfficials, authHeader)`) and line 835 (`'Authorization': authHeader`) as-is. When `authHeader` is an empty string, `get-candidate-answers` will still accept the call because that function no longer requires user auth either (it's invoked server-to-server with the service-role-bearing internal flow). If we later see `get-candidate-answers` reject empty Authorization, fall back to `\`Bearer ${SUPABASE_SERVICE_ROLE_KEY}\`` — but do not do that proactively (we don't want to leak service-role power if not needed).

3. No other files change. No DB migration. Once redeployed, the function returns the full officials payload again and the Profile page shows all the previously-listed candidates (Federal Executive, State Executive, State Legislative, Local).

## Validation

- After the edit, hit the function with `supabase--curl_edge_functions` using the user's address and confirm the JSON contains non-empty `federalExecutive`, `stateExecutive`, `stateLegislative`, and `local` arrays.
- Re-check `supabase--edge_function_logs fetch-civic-officials` for absence of `authHeader is not defined`.
