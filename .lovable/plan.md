## 15s PoliPulse Product Video

Render a 15-second 1920x1080 MP4 with Remotion, AI voiceover via ElevenLabs, kinetic UI mockups in PoliPulse's brand style. Final file: `/mnt/documents/polipulse-product-video.mp4`.

### Creative direction

- **Aesthetic**: Tech product — dark UI, crisp geometric sans, snappy spring transitions, code/grid layouts.
- **Palette** (pulled from project): deep navy `#0F172A` background, primary `#3B82F6`, civic red `#EF4444` and civic blue `#1D4ED8` accents, ink `#E2E8F0` text, muted `#64748B`.
- **Type**: Space Grotesk (display) + Inter (body), via `@remotion/google-fonts`.
- **Motion**: snappy spring entrances (damping 20, stiffness 200), one fade+slide transition between scenes, persistent subtle grid backdrop.

### Voiceover script (~38 words, ~14s at natural pace)

> "Politics is noisy. PoliPulse cuts through it. Take a 2-minute quiz, get matched to candidates who actually share your values — backed by voting records, donor data, and evidence. Real transparency. Your pulse on politics."

Voice: George (`JBFqnCBsd6RMkjVDRZzb`), `eleven_multilingual_v2`.

### Scene breakdown (450 frames @ 30fps)

```text
[0–60]    Hook: "Politics is noisy."  — chaotic headline ticker collapses into logo
[60–150]  Quiz: animated question card with -10/+10 slider snapping
[150–240] Match: candidate cards fly in with match % counters animating up
[240–360] Transparency: split view — voting record rows + donor bars filling
[360–450] Outro: PoliPulse wordmark + tagline "Your pulse on politics." + URL
```

### Implementation steps

1. **Scaffold** `remotion/` project: `bun init`, install `remotion`, `@remotion/cli/renderer/bundler/transitions/google-fonts`, `@remotion/compositor-linux-x64-musl`, React. Fix gnu compositor binary + symlink ffmpeg/ffprobe (per sandbox rules).
2. **Generate voiceover** with ElevenLabs TTS script → save to `remotion/public/audio/vo.mp3`.
3. **Build scenes** (5 files under `src/scenes/`) using `useCurrentFrame` + `interpolate`/`spring`. Use `<Audio>` with the VO across the full composition.
4. **Wire** in `MainVideo.tsx` via `<TransitionSeries>` with fade transitions (~10 frames) between scenes; persistent grid background layer.
5. **Render** via programmatic `scripts/render-remotion.mjs` (chrome-for-testing, muted:false since we want VO, concurrency 1) → `/mnt/documents/polipulse-product-video.mp4`.
6. **QA**: render a still at frames 30, 120, 200, 300, 420 to confirm typography + layout, then deliver MP4 via `<presentation-artifact>`.

### Technical notes

- Composition duration accounts for transition overlap (~40 frames total of overlap).
- Audio not muted in renderer; ensure ffmpeg in PATH symlinks are in place so audio encodes.
- No `backdropFilter`; use subtle `filter: blur()` only on 1–2 glow accents.
- All copy and colors live in components — no business logic touched.
