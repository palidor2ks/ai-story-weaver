## Fix: VO/scene sync + remove "slide" wording

**Problem**
1. The voiceover script says "slide your position from left to right" — but the actual quiz uses tappable buttons (Strongly Disagree → Strongly Agree). Wrong product copy.
2. VO is 51.6s, video is 60s, and scenes were timed by guess. Audio drifts from visuals throughout.

**Approach: per-scene VO chunks for frame-accurate sync**

Instead of one monolithic MP3, generate one MP3 per scene, measure each with `ffprobe`, and set each scene's `durationInFrames` to match its audio (+ a small tail for breathing room). Then concatenate the chunks into the final `vo.mp3` so timing is guaranteed to line up.

### 1. Rewrite script (8 scenes, button-based wording)

```
Onboarding:  "Politics moves fast — and most of us can't keep up with who really represents us. Polipulse fixes that."
QuizTopics:  "Start by picking the federal issues you actually care about — your top three."
QuizButtons: "Then answer twenty-four short questions. Tap how strongly you agree or disagree — no jargon, no traps."
Feed:        "In seconds, we match you with every official representing you, from the President down to your town council."
Candidates:  "Each one earns a score, from L-ten on the far left to R-ten on the far right — built from real voting records and public statements."
Donor:       "Then go deeper. See exactly who's funding their campaign — every donor, every PAC, every dollar."
Committees:  "Browse the top committees raising the most, and the outside groups spending hundreds of millions to sway your vote."
Closing:     "No spin. No vibes. Just receipts. Polipulse — know your representatives, follow the money, cast a smarter vote."
```

### 2. Rename + rewrite `QuizSlider.tsx` → `QuizButtons.tsx`

Replace "Slide your position. Left to right." with "Tap how you feel." sub copy updated to reference the five buttons. Keep using `quiz.png` (which already shows the button row). Update import in `MainVideo.tsx`.

### 3. Update `remotion/scripts/generate-vo.mjs`

- Define `SCENES = [{ id, text }]` array (8 entries above).
- For each scene: call ElevenLabs, save `public/audio/vo-<id>.mp3`, run `ffprobe` to get duration in seconds, compute `frames = ceil(duration * 30) + 12` (12-frame tail ≈ 0.4s pad).
- Concatenate all MP3s with `ffmpeg -f concat` into `public/audio/vo.mp3`.
- Write `public/audio/vo-timings.json` with `{ id, durationInFrames, startFrame }` for each scene.

### 4. Drive `MainVideo.tsx` from the timings file

- Import `vo-timings.json` at build time.
- Set each `<TransitionSeries.Sequence durationInFrames={...}>` from the JSON.
- Keep 10-frame fade transitions; subtract `(numTransitions × 10)` worth of overlap by adding it back to total composition duration: `total = sum(sceneFrames) - 7*10`.
- Update `Root.tsx` `durationInFrames` to that computed total (or export a constant from `MainVideo` and read it in `Root`).

### 5. Re-render

- Run `node remotion/scripts/generate-vo.mjs` (needs `ELEVENLABS_API_KEY`).
- `node remotion/scripts/render-remotion.mjs` → silent MP4 at `/tmp/polipulse-silent.mp4`.
- `ffmpeg -i /tmp/polipulse-silent.mp4 -i remotion/public/audio/vo.mp3 -c:v copy -c:a aac -b:a 192k /mnt/documents/polipulse-60s_v2.mp4`.
- Spot-check: extract stills at the boundary frame of each scene, confirm caption matches what the VO is saying at that moment.

### Files touched
- `remotion/scripts/generate-vo.mjs` (rewrite)
- `remotion/src/scenes/QuizSlider.tsx` → `QuizButtons.tsx` (rename + copy)
- `remotion/src/MainVideo.tsx` (import timings, set durations, update import)
- `remotion/src/Root.tsx` (computed total duration)
- New: `remotion/public/audio/vo-*.mp3`, `vo-timings.json`
- Output: `/mnt/documents/polipulse-60s_v2.mp4`

### Notes
- Final video length will be whatever the VO sums to (likely ~55–62s) — not forced to exactly 60s. Sync > round number.
- If a scene's VO is shorter than ~5s, pad to a 5s minimum so the visual has time to breathe.
