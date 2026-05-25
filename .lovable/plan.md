## 60-Second Product Video — Real App Pages

A 60-second 1920×1080 30fps Remotion video that walks through the actual Polipulse app. Each scene uses a real, high-res screenshot of a live route, animated inside Remotion with parallax, ken-burns zooms, masked reveals, and call-out overlays. George (ElevenLabs) narrates over the top, with the existing Tech Product aesthetic from the first video so the two read as a series.

### Scene plan (60s = 1800 frames @ 30fps)

| # | Time | Route captured | What happens on screen |
|---|------|----------------|------------------------|
| 1 | 0:00 – 0:06 | Logo + tagline cold open | Animated pulse mark, "Your pulse on politics", smash cut into the product |
| 2 | 0:06 – 0:14 | `/` (home/feed) | Browser-chrome reveal, slow ken-burns up the page, headline call-out: "See what's happening — and who's behind it" |
| 3 | 0:14 – 0:24 | `/quiz` | Zoom into one issue card, animated slider snaps to a position, "Answer once. Get matched everywhere." |
| 4 | 0:24 – 0:34 | `/candidate/:id` (real federal incumbent) | Pan from header → score card → voting record → Funding Sources panel (the new one we just shipped). Call-out: "Score, votes, and money — for every candidate." |
| 5 | 0:34 – 0:42 | `/donor/:id` (top donor) | Cross-fade in, parallax over the donor's recipient list, call-out: "Follow the money to the people who get it." |
| 6 | 0:42 – 0:50 | `/legislation/:id` (recent bill) | Zoom into bill summary + roll-call breakdown, call-out: "Every bill, every vote, explained." |
| 7 | 0:50 – 0:57 | `/committees` or `/top-spenders` | Quick montage — list rows stagger-in, then dolly back to reveal the whole page |
| 8 | 0:57 – 1:00 | Outro | Logo + URL `polipulseapp.com`, soft fade to brand navy |

### Capture pipeline

1. Start a one-off Playwright/Puppeteer script under `remotion/scripts/capture-screens.mjs` that:
   - Boots a headless Chromium pointed at the **published** site `https://polipulse.lovable.app` (no auth needed for these routes; we already saw they render publicly).
   - For each route in the table above, sets viewport `1920×1080` (and `1920×3000` for the long candidate/donor/bill pages so we have height to ken-burns through), waits for network-idle + a small settle delay, and writes a PNG to `remotion/public/screens/<scene>.png`.
   - Hides any cookie banners / dev overlays via CSS injection before screenshot.
2. Pick stable real entities up front so URLs are deterministic:
   - Candidate: a current federal incumbent (e.g. House Speaker or similar high-coverage profile from `/candidates` ordered by coverage_tier).
   - Donor: top donor from `/donors`.
   - Bill: top bill from `/legislation`.
   - We'll resolve these IDs once via the public list pages, hard-code them in the capture script, and log them in the plan output so you can swap.
3. Re-running the capture script regenerates all screens — useful when the UI changes.

### Remotion structure

Reuses the existing `remotion/` project from the last video — no second scaffold. Adds:

```
remotion/
  public/screens/                          (new — capture output)
  public/audio/vo-v2.mp3                   (new — 60s narration)
  scripts/capture-screens.mjs              (new — Playwright capture)
  scripts/render-remotion.mjs              (existing — re-used)
  src/
    Root.tsx                               (add second Composition: `product-tour`)
    MainVideoTour.tsx                      (new — TransitionSeries of 8 scenes)
    scenes/tour/
      Cold.tsx
      Home.tsx
      Quiz.tsx
      Candidate.tsx
      Donor.tsx
      Bill.tsx
      Spenders.tsx
      Outro.tsx
    components/
      BrowserFrame.tsx                     (new — chrome around screenshots: traffic lights, URL bar)
      ScreenScroll.tsx                     (new — ken-burns pan over tall screenshots via interpolate on translateY)
      CallOut.tsx                          (new — pill label that springs in, holds, springs out)
```

Each scene is built the same way: `<BrowserFrame url="...">` wrapping an `<Img>` of the captured screen, animated with `useCurrentFrame()` + `interpolate()` for translate/scale/opacity, with one or two `<CallOut>` overlays that align to specific regions of the screenshot. Scenes are stitched with `<TransitionSeries>` using the same `fade` / `wipe` transitions as the first video so the look is consistent.

### Voiceover

George (`JBFqnCBsd6RMkjVDRZzb`), `eleven_multilingual_v2`, generated server-side via the existing `ELEVENLABS_API_KEY`. ~135 words pacing to ~58s. Draft:

> "Politics moves fast — and it's loud. Polipulse cuts through the noise.
> Answer one quick issue quiz, and we match you to every candidate on your ballot, from president to school board.
> Every profile shows their score, their votes, and exactly who funds them — broken down by individuals, PACs, and self-funding.
> Follow the money the other direction too: see where any donor sends their cash, and which committees back which races.
> Every bill is explained in plain English, with the full roll call — no spin.
> One platform. Real data. Your pulse on politics. Polipulseapp.com."

Saved to `remotion/public/audio/vo-v2.mp3`. Mounted as `<Audio src={staticFile('audio/vo-v2.mp3')} />` in `MainVideoTour`.

### Render

Re-uses `scripts/render-remotion.mjs`, switched to the new composition id `product-tour`. Renders muted MP4, then `ffmpeg` muxes `vo-v2.mp3` (matches the proven first-video workflow that avoided the `libfdk_aac` sandbox limitation). Final file: `/mnt/documents/polipulse-product-tour.mp4`.

### QA before delivery

Extract 8 stills (one per scene) with `bunx remotion still` and inspect — verify each screenshot loaded, the call-outs land in the right spot, no text is clipped, and the transitions read cleanly. Re-render if anything is off.

### Notes / risks

- If the published site requires a cookie banner dismissal or has loading shimmer at capture time, the capture script adds a 1.5s settle + injected CSS to hide them.
- If a chosen route changes data (e.g. a candidate's funding numbers update), re-running `capture-screens.mjs` refreshes everything.
- File touched outside `remotion/`: none. This is a self-contained video build.
