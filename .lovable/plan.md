## Why the photo is missing

The Stat Card is falling back to initials ("AK") because the candidate image never resolves to a usable source:

1. `ShareProfileButton` and `useCandidateShareCardData` try to convert the photo URL to a base64 data URL via `imageUrlToBase64`, which does a plain `fetch(url)` in the browser.
2. The photo URL is almost always `https://bioguide.congress.gov/bioguide/photo/...jpg` (or another external host). Bioguide does **not** send `Access-Control-Allow-Origin`, so the browser blocks the `fetch` → `imageUrlToBase64` throws → `resolvedImage` stays as the raw bioguide URL.
3. `CandidateStatCard` then renders `<img src={bioguideUrl} crossOrigin="anonymous" />`. Because the response has no CORS header, the browser rejects the load and fires `onError`, flipping `imgFailed = true` → initials fallback.

Net result: every cross-origin candidate photo (Bioguide, most state photo CDNs) silently fails. Only same-origin images (e.g. Supabase Storage on our own project) work today.

## Fix

Add a tiny image proxy and route all card image loads through it so the bytes come from our own origin with proper CORS + cache headers.

### 1. New edge function `proxy-image` (public, no JWT)
- `GET /functions/v1/proxy-image?url=<encoded>`
- Validates the URL: must be `https://`, hostname in an allowlist (`bioguide.congress.gov`, `*.house.gov`, `*.senate.gov`, `*.supabase.co`, `*.openstates.org`, our storage host).
- Server-side `fetch` the image; pass `content-type` through (must start with `image/`).
- Respond with the image bytes plus `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=31536000, immutable`.
- Rejects HTML, redirects to non-allowlisted hosts, and oversized payloads (>3 MB).

### 2. Frontend changes
- New helper `src/lib/imageProxy.ts` exporting `proxiedImageUrl(url)` — returns the original URL if it's same-origin / data URL, otherwise wraps it as `${SUPABASE_URL}/functions/v1/proxy-image?url=...`.
- Update both `imageUrlToBase64` implementations (`src/components/ShareProfileButton.tsx` and `src/hooks/useCandidateShareCardData.ts`) to call `proxiedImageUrl(url)` before `fetch`. This makes base64 conversion succeed for Bioguide, so the modal preview and the html-to-image PNG export both embed the real photo.
- In `CandidateStatCard` (and `EditorialCard`, which also reads `candidateImage`), if `image` is still an http(s) URL at render time (base64 conversion in flight or failed), render `<img src={proxiedImageUrl(image)} ...>` instead of the raw URL. Keep the existing `onError` → initials fallback as a last resort.

### 3. Verification
- Open a Bioguide-backed candidate (e.g. Andy Kim `K000377`) → Share → Stat Card. Photo should now appear in preview and in the downloaded/posted PNG.
- Network tab should show one `proxy-image?url=...bioguide...` request returning `200 image/jpeg` with `access-control-allow-origin: *`.
- Initials fallback still kicks in only when the upstream URL truly 404s.

### Files touched
- `supabase/functions/proxy-image/index.ts` (new)
- `supabase/config.toml` (register function, `verify_jwt = false`)
- `src/lib/imageProxy.ts` (new)
- `src/components/ShareProfileButton.tsx`
- `src/hooks/useCandidateShareCardData.ts`
- `src/components/share/templates/CandidateStatCard.tsx`
- `src/components/share/templates/EditorialCard.tsx`

No DB / schema changes.