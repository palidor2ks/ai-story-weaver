# Fix: candidate photo missing on share card

## Root cause

`CandidateStatCard` renders `<img src={image} crossOrigin="anonymous" />`. The `crossOrigin` attribute is required so `html2canvas` can serialize the card to PNG without tainting the canvas. But the candidate photo URL (Bioguide / external host) does not return `Access-Control-Allow-Origin`, so the browser blocks the image and only the `alt` text shows. That's why the photo box appears empty with "Thomas Massie" text in the corner.

Removing `crossOrigin` would let the image display in the live preview but would break the PNG export (canvas tainting). The correct fix is to fetch the image once on the client, convert it to a base64 data URL, and pass that data URL into the card. Data URLs are same-origin and bypass CORS entirely.

## Changes

**`src/components/ShareProfileButton.tsx`**
- Add a small helper `imageUrlToBase64(url)` (fetch → blob → FileReader.readAsDataURL).
- When the modal opens (or in a `useEffect` keyed on `candidateImage`), convert `candidateImage` to a data URL and store it in local state `resolvedImage`.
- Pass `resolvedImage ?? candidateImage` as `candidateImage` into `ShareCardModal` / `CardData`.
- If the fetch fails, fall back to `null` so the card shows the initials placeholder instead of a broken image.

**`src/components/share/templates/CandidateStatCard.tsx`**
- No structural changes. Keep `crossOrigin="anonymous"` (harmless for data URLs, still needed if a non-converted URL ever flows through).
- Optional: add `onError` on the `<img>` to swap to the initials placeholder if the image fails for any reason.

## Notes

- No backend / edge-function work needed; conversion happens in the browser.
- This also fixes the exported PNG, which currently would either be missing the photo or fail entirely due to the tainted canvas.
- No other share templates use a remote candidate photo today, so the scope stays inside `ShareProfileButton` + `CandidateStatCard`.
