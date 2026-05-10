## Goal

When a user shares from the modal, X / Facebook / LinkedIn should unfurl a rich preview showing **the actual generated card** (Bold or Data), not the generic site OG image.

## Why this is needed

Social platforms ignore any image attached via intent URLs and instead scrape `og:image` from the shared URL. Today every share points at `polipulseapp.com/results` (or a candidate URL) which renders the static `/og-image.png` from `index.html`. We need each share to resolve to a tiny URL whose server response carries a unique `og:image` pointing at the user's PNG.

## Architecture

```text
[ShareCardModal]
    │ 1. render template -> PNG blob
    │ 2. POST blob -> upload-share-card edge fn
    ▼
[upload-share-card]
    │ - validates PNG, size, mime
    │ - stores at share-cards/{id}.png in Storage (public)
    │ - inserts row into share_cards (id, image_path, target_url, caption, expires_at)
    ▼
   returns { id, shareUrl: "https://polipulseapp.com/s/{id}" }

[User clicks Share on X / FB / LinkedIn]
    │ intent opens with shareUrl (not /results)
    ▼
[Crawler fetches /s/{id}]
    │ Lovable hosting falls through to share-card-page edge fn
    │ (routed via a dedicated subdomain or query param — see "Routing" below)
    ▼
[share-card-page]  returns minimal HTML:
    <meta property="og:image" content="<public storage URL>">
    <meta property="og:title" ...>
    <meta http-equiv="refresh" content="0; url=<target_url>">
   → Crawlers see rich card; humans get redirected to /results.
```

## Backend changes

### 1. Storage bucket
- New public bucket `share-cards` (read = public, insert = service role only).
- Files stored as `{id}.png` where `id` is a short nanoid.

### 2. Database table `share_cards`
Columns: `id text pk`, `user_id uuid null`, `image_path text`, `target_url text`, `og_title text`, `og_description text`, `created_at`, `expires_at timestamptz default now() + interval '90 days'`.
RLS: select public (so the page function can read by anon key), insert via service role only.
Nightly cleanup: delete expired rows + their storage objects.

### 3. Edge function `upload-share-card` (POST)
- Accepts multipart `file` (PNG, ≤2 MB, dimensions 1080×1080) plus JSON metadata `{ targetUrl, ogTitle, ogDescription }`.
- Validates inputs with zod.
- Generates id, uploads to storage, inserts row, returns `{ id, shareUrl }`.
- No auth required (anonymous shares are fine), but rate-limit per-IP (simple in-memory bucket).

### 4. Edge function `share-card-page` (GET)
- Path: `/share-card-page?id={id}` (or matched via routing — see below).
- Looks up row, returns `text/html` with full OG/Twitter tags and a `<meta http-equiv="refresh">` + `<script>location.replace(targetUrl)` fallback.
- `Cache-Control: public, max-age=86400`.

### Routing for `/s/{id}`

Lovable hosting serves SPA fallback for unknown routes, so we cannot intercept `/s/{id}` server-side directly. Two viable approaches:

**A. Use the edge function URL directly (simplest, ships today).**
ShareUrl = `https://ornnzinjrcyigazecctf.supabase.co/functions/v1/share-card-page?id={id}`.
Crawlers fetch this and get OG tags; humans get redirected to the real page. Downside: ugly URL in the X composer preview.

**B. Pretty URL via SPA + crawler check.**
Add a `/s/:id` React route that, on mount, calls the function and redirects. For OG tags, point shareUrl at `https://polipulseapp.com/s/{id}` and rely on a Cloudflare/edge worker to detect bot user-agents and reverse-proxy to `share-card-page`. Requires custom-domain config the user may not want.

I recommend **A** for v1 (the link previews look identical once unfurled — the raw URL is hidden behind the card on every platform). We can move to B later.

## Frontend changes

### `src/lib/shareImage.ts`
- Add `nodeToPngBlob(node)` that returns the PNG blob (factor out of `nodeToBlob`).

### `src/lib/shareUpload.ts` (new)
- `uploadShareCard({ blob, targetUrl, ogTitle, ogDescription }) → Promise<{ shareUrl }>` calling the edge function via `supabase.functions.invoke`.

### `src/components/share/ShareCardModal.tsx`
- New `prepareShareUrl()` that:
  1. Renders the currently-selected template node to a PNG.
  2. Uploads it via `uploadShareCard`.
  3. Caches the resulting `shareUrl` in state, keyed by `selected` template id (re-upload only when template changes).
- All three intent handlers (`Share on X`, `Facebook`, `LinkedIn`) and `handleNative` now `await prepareShareUrl()` and pass that URL instead of the raw `url` prop.
- Show a loading state on the buttons during upload (~1 sec).
- Errors: if upload fails, fall back to current behaviour (open intent with raw `url`) and toast a warning.

### Helper text
- Update the tip beneath the buttons: "Sharing on X, Facebook or LinkedIn now embeds your card automatically — no copy/paste needed."

## Captions / OG tags content
- `og:title`: `caption.candidateName ? "My match with {name}" : "My political profile on Pulse"`
- `og:description`: first 140 chars of the user's edited caption.
- `og:image`: public Storage URL (1080×1080).
- `twitter:card`: `summary_large_image`.

## Cleanup
- Cron edge function `cleanup-share-cards` (daily): delete `share_cards` rows where `expires_at < now()` and remove the storage objects.

## What I'll deliver in implementation
1. Migration: bucket + `share_cards` table + RLS + cleanup function scaffold.
2. Edge functions: `upload-share-card`, `share-card-page`, `cleanup-share-cards`.
3. Frontend: `shareUpload.ts`, modal wiring, button loading states, helper text.
4. Verification: trigger a share from `/results`, fetch the resulting `share-card-page` URL with curl, confirm OG tags + image URL, then test the X intent in the preview.

## Open questions
- Bucket retention: 90 days OK, or do you want shares to live forever?
- Do you want signed-in user_id stamped on the row (for "delete my shared cards" later), or fully anonymous?
