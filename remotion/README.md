# Website video tool

A 3-stage pipeline that turns the live site into a narrated product video
(`1920×1080`, h264) using [Remotion](https://remotion.dev), Playwright, and
ElevenLabs.

## Pipeline

| Stage | Command | What it does | Needs |
| --- | --- | --- | --- |
| 1. Capture | `bun run capture` | Playwright screenshots of the live site → `public/screens/*.png` | system Chromium, `BASE_URL` |
| 2. Voiceover | `bun run vo` | ElevenLabs narration of the 8 scenes → `public/audio/vo.mp3` + `vo-timings.json` | `ELEVENLABS_API_KEY`, `ffmpeg` |
| 3. Render | `bun run render` | Remotion stitches screens + animations + audio → `out/website-video.mp4` | a browser (auto-downloaded if none) |

`bun run video` runs all three in order. The screenshots and voiceover are
committed to the repo, so `bun run render` works on its own with no API keys.

`bun run studio` opens the Remotion editor for live previewing/tweaking scenes.

## Editing the video

- **Narration**: edit the `SCENES` array (text per scene) in `scripts/generate-vo.mjs`, then `bun run vo`.
- **Screens captured**: edit the `targets` array in `scripts/capture-screens.mjs`.
- **Scene visuals / order**: the React scenes live in `src/scenes/`; order and timing are wired in `src/MainVideo.tsx`.

## Render options (env vars)

- `OUT` — output path (default `out/website-video.mp4`).
- `MUTED=1` — render a silent video (voiceover is included by default).
- `PUPPETEER_EXECUTABLE_PATH` — use a specific Chromium; if unset, Remotion downloads its own.
- `BASE_URL` — site URL for screenshot capture.

## Render in CI

The `.github/workflows/render-video.yml` workflow (Actions → "Render website
video" → Run workflow) renders the video on GitHub's runners and uploads the
`.mp4` as a downloadable artifact. By default it reuses the committed assets;
toggle the inputs to re-capture screenshots or regenerate narration. Add an
`ELEVENLABS_API_KEY` repo secret if you enable voiceover regeneration.
