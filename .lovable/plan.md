## Goal
Two fixes for the Relevant News card:
1. **Snippet shows raw `<a href="...">` HTML** — strip it so users only see clean text (or no snippet).
2. **Links open `news.google.com` and get `ERR_BLOCKED_BY_RESPONSE`** — Google News' new RSS format embeds an opaque `CBMi…` redirect URL and no publisher `<a href>` in the description, so `extractPublisherUrl()` falls back to the blocked Google URL.

## Changes

### `supabase/functions/fetch-relevant-news/index.ts`

**A. Resolve real publisher URL server-side**
Add `resolveGoogleNewsUrl(googleUrl)`:
- `fetch(googleUrl, { redirect: 'manual' })` and read `Location` header.
- If still on `news.google.com`, follow up to 2 more hops (manual) until host is a publisher.
- Cache resolutions in an in-memory `Map` for the function lifetime to keep latency down.
- Wrap in `Promise.all` with a per-URL timeout (~3s via `AbortController`) so a slow redirect can't stall the whole response.

Update the item pipeline:
1. First try `extractPublisherUrl(description, link)` (current logic).
2. If the result is still a `news.google.com` / `google.com` URL, call `resolveGoogleNewsUrl(link)`.
3. If resolution still returns a Google host, **drop the item** (don't show unclickable links).

**B. Clean snippet properly**
`cleanText()` already strips tags, but description content is wrapped in `<![CDATA[ ... ]]>` and contains nested HTML the regex passes through. Tighten:
- Remove CDATA wrapper first (already done).
- Strip ALL tags including self-closing and attributes spanning newlines: `/<\/?[a-z][^>]*>/gis`.
- After stripping, if remaining text looks like leftover URL/markup (starts with `http`, or is <20 chars of junk), set snippet to empty.
- Cap at 200 chars.

### `src/components/RelevantNewsFeed.tsx`
- Only render the `<p>` snippet if `item.snippet` is non-empty AND doesn't start with `http` (defensive).
- No other layout changes.

## Out of scope
- No DB caching of resolved URLs (in-memory is enough for now).
- No change to scoring, time-window, or query construction.

## Technical notes
- `fetch` in Deno honors `redirect: 'manual'` and exposes `Location` via `res.headers.get('location')`.
- Google's redirect chain for `CBMi...` URLs typically resolves in 1–2 hops to the publisher.
- We cap concurrent resolutions at the existing `Promise.all` over already-deduped items (~20 max), each with a 3s `AbortController`, so worst-case added latency is ~3s.

## Verification
- Curl the edge function for a known representative; confirm every returned `items[].url` host is NOT `news.google.com`/`google.com`.
- Confirm no `items[].snippet` contains `<` or starts with `http`.
- Click 3 items in the Feed page; each should land on a publisher article (not a blocked Google page).
