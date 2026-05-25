## Goal
The header in several captured screenshots (feed, candidates, committees, quiz, donor, spenders) shows the logged-in user's name in the top-right pill. Hide it so it doesn't appear in the video.

## Approach
Do it at capture time — cleaner than overlaying blur rectangles in Remotion (which would need per-screen coordinates and rebreak if screenshots are recaptured).

### 1. Update `remotion/scripts/capture-screens.mjs`
Extend the existing `hideCss` block to hide the username text element in `src/components/Header.tsx`:

```css
/* Hide logged-in user name in header pill */
header .max-w-\[140px\].truncate { display: none !important; }
```

That `span` (line ~106 of Header.tsx) is the only place the name renders in the header. The avatar circle stays visible so the pill still reads as "signed in."

### 2. Re-run capture
`cd remotion && node scripts/capture-screens.mjs` to regenerate the 7 affected PNGs in `remotion/public/screens/`.

### 3. Re-render video
- `node scripts/render-remotion.mjs` → silent MP4
- `ffmpeg` mux with `public/audio/vo.mp3` → `/mnt/documents/polipulse-60s_v3.mp4`

No scene code, timings, or VO changes — just fresh screenshots with the name hidden, then a re-render.

## Alternative (if capture isn't desired)
Add a small `<div>` with `filter: blur(12px)` positioned over the header's top-right region inside `Screenshot.tsx`, gated by a `blurUserName` prop. Less robust (coordinates depend on each screen's crop/zoom) but doesn't require re-capturing.

Which do you prefer — recapture (recommended) or in-Remotion blur overlay?