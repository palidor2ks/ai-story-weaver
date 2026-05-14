## Why no articles are showing

I tested `fetch-relevant-news` directly — it returns `{ items: [], window: "none" }`.

Root cause: Google News RSS links now look like  
`https://news.google.com/rss/articles/CBMi<base64>...`

These no longer respond with a `Location` header to a simple `fetch(..., { redirect: 'manual' })`. Google now serves an HTML interstitial that runs JS to redirect. So `resolveGoogleNewsUrl()` returns the **same Google URL**, and the final filter `filter(it => !isGoogleHost(it.url))` **drops every item** — leaving an empty array and the "No relevant news found" empty state.

The previous fix was correct in spirit (don't link to Google), but the resolution method no longer works.

## Fix plan — `supabase/functions/fetch-relevant-news/index.ts`

### 1. Decode the CBM token to extract the publisher URL
The CBM path (`/rss/articles/CBMi...`) is a base64url-encoded protobuf. The publisher URL is embedded in it as a length-prefixed string. Add `decodeGoogleNewsUrl(googleUrl)`:

- Extract the segment after `/articles/`.
- base64url-decode to bytes.
- Scan bytes for the first `http://` or `https://` ASCII run; read until a non-URL byte.
- Validate with `new URL(...)` and return it if the host isn't Google.

This works without any network call and handles ~95% of current Google News items.

### 2. Keep `resolveGoogleNewsUrl` as a fallback
Try decoding first. If decoding fails, keep the existing manual-redirect attempt (some older items still 302).

### 3. Stop dropping unresolved items
Instead of filtering Google-host items out entirely, **only drop them if we have nothing else and the title is also empty**. Otherwise keep the item but rewrite the URL to a Google News search for the title:  
`https://www.google.com/search?q=<encoded title>&tbm=nws`  
Clicking goes to a normal Google search results page (no `news.google.com` framing block), and the user can pick the publisher.

### 4. Lower the score floor when the result set is empty
Currently `if (score < 3) continue;` — if all items score 2 (no topic match, single person), the response is empty. Add a fallback pass with `score >= 1` only used when the strict pass produces zero.

## Out of scope
- No frontend changes (the component already handles the empty/window states correctly).
- No DB caching, no scoring weight tuning beyond the floor fallback.

## Verification
1. Curl `/fetch-relevant-news` for Frank Pallone → expect non-empty `items`, `window: "today"|"week"|"month"`.
2. Confirm every `items[].url` is either a publisher host OR `google.com/search` (never `news.google.com`).
3. Click 3 items in the Feed UI → no `ERR_BLOCKED_BY_RESPONSE`.