## Goal
Produce a polished ~60-second Polipulse explainer video using the 9 fresh screenshots the user just uploaded, with a new George voiceover and Remotion scenes that animate the real product UI.

## Assets (from this upload)
Copy uploaded images into `remotion/public/screens/`:
- `Screenshot_1.png` → `home.png` (Feed hero)
- `www.polipulseapp.com_feed.png` → `home-tall.png` (full feed pan)
- `www.polipulseapp.com_candidates.png` → `candidates.png` (all politicians grid)
- `www.polipulseapp.com_candidates_1.png` → `donor.png` (Campaign Donors page)
- `committee.png` → `committees.png`
- `spenders.png` → `spenders.png`
- `quiz_with_slider.png` → `quiz.png`
- `top_3_topics.png` → `quiz-topics.png` (new)
- `onboarding_screen.png` → `onboarding.png` (new)

## Video structure (~60s @ 30fps = 1800 frames)

```
1. Hook / Onboarding      0:00–0:07   "Politics is noisy. Polipulse cuts through."
2. Quiz topics + slider   0:07–0:16   "Pick 3 topics. Answer 24 questions."
3. Match / Feed           0:16–0:25   "Get matched with every official representing you."
4. Candidate grid         0:25–0:32   "L10 → R10 scores across 600+ officials."
5. Donor profile          0:32–0:41   "See who funds them — every dollar tracked."
6. Committees + Spenders  0:41–0:51   "Top committees and the PACs spending on their behalf."
7. Outro                  0:51–1:00   "Polipulse — follow the money. Know your vote."
```

Each scene: ken-burns pan/zoom on the relevant screenshot in a laptop-style frame, with kinetic title overlays (Playfair Display + Inter), the Polipulse navy/red accent palette, and `TransitionSeries` fades/wipes between scenes.

## Voiceover
Generate one MP3 via ElevenLabs `eleven_multilingual_v2`, voice `George` (`JBFqnCBsd6RMkjVDRZzb`), ~150 words, save to `remotion/public/audio/vo.mp3`. Script tuned to 60s and synced to scene durations.

## Implementation steps
1. Copy 9 uploaded PNGs into `remotion/public/screens/` with the names above.
2. Write VO script + one-off Bun script that calls ElevenLabs and writes `remotion/public/audio/vo.mp3`.
3. Update `remotion/src/Root.tsx` → `durationInFrames={1800}`.
4. Rewrite `remotion/src/MainVideo.tsx` with 7 `TransitionSeries.Sequence`s totaling 1800 frames (accounting for transition overlaps).
5. Add new scene files under `remotion/src/scenes/`:
   - `Onboarding.tsx`, `QuizTopics.tsx`, `QuizSlider.tsx`, `Feed.tsx`, `Candidates.tsx`, `Donor.tsx`, `Committees.tsx`, `Outro.tsx`
   - Each uses a shared `LaptopFrame` component with ken-burns transform driven by `useCurrentFrame` + `interpolate`, plus headline/sub overlay.
6. Add `remotion/src/components/LaptopFrame.tsx` and `Caption.tsx` helpers.
7. Render via existing `remotion/scripts/render-remotion.mjs`, output to `/mnt/documents/polipulse-60s.mp4`.
8. QA: extract 6 stills with `bunx remotion still` at key frames, view them, fix any layout/clipping, re-render if needed.
9. Deliver MP4 via `<presentation-artifact>`.

## Technical notes
- All motion via `useCurrentFrame` + `interpolate`/`spring`; no CSS transitions.
- No `backdropFilter`; light `filter: blur()` only on background accents.
- VO audio added once at root via `<Audio>` so it spans all scenes.
- Keep total frames = sum(sequences) − sum(transition overlaps) = exactly 1800.
