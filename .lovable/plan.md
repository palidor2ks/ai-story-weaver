## Goal

Replace the plain text-only share menus with a polished **Preview-and-pick** modal. When the user clicks Share, they see 4 visually distinct card designs rendered with their actual data. They pick one, then download the PNG or copy it to clipboard, and a second action opens X / Facebook / LinkedIn / native share with the link prefilled.

## Where it applies

1. **Quiz Results page** (`src/pages/QuizResults.tsx`) — "Share my results" and "Invite others" sub-menus.
2. **Candidate alignment** (`src/components/ShareProfileButton.tsx`) — used on candidate profile pages.

## The 4 templates

All use the existing brand tokens (HSL from `index.css`) — no hardcoded colors. Each is a 1080×1080 square (Instagram/X/FB friendly), plus a 1200×630 OG variant generated from the same React component for link unfurls.

1. **Bold** — Huge score glyph (e.g. `CR2`) on a gradient background, name underneath, Pulse wordmark. Maximum scroll-stopper.
2. **Minimal** — Off-white card, thin display type, single hairline divider, score + match % + small Pulse mark. Editorial calm.
3. **Data Card** — Top 3 topic bars with left/right scale, agreement/disagreement labels, candidate vs user dots. Most informative.
4. **Editorial** — Magazine-style: portrait/avatar on the left, large pull-quote ("78% aligned with JD Vance"), serif accents, footer with URL.

For "Invite others" and "My profile" (no candidate context), templates 3 and 4 swap their data slots: Data Card shows the user's own top topics; Editorial shows the user's score badge instead of a candidate portrait.

## User flow

```text
[Share button] → Modal opens
  ├─ Carousel/grid of 4 live-rendered template previews
  ├─ Pick one (highlights)
  ├─ Action row:
  │   ├─ Download PNG
  │   ├─ Copy image to clipboard
  │   └─ Share to: [X] [Facebook] [LinkedIn] [More…]   ← opens intent URL with link + caption
  └─ "Copy caption text" secondary button
```

The intent URLs (X/FB/LinkedIn) only carry the URL + caption, since those sites don't accept images via web intents. The image is what the user pastes/attaches into the composer after copying or downloading.

## Technical approach

- **New component** `src/components/share/ShareCardModal.tsx` — Dialog that hosts the preview grid + actions. Accepts a discriminated-union prop:
  - `{ kind: 'candidate-alignment', candidate, matchScore, agreements, disagreements, userScore }`
  - `{ kind: 'user-profile', score, label, topTopics }`
  - `{ kind: 'invite' }`
- **Templates** in `src/components/share/templates/` — `BoldCard.tsx`, `MinimalCard.tsx`, `DataCard.tsx`, `EditorialCard.tsx`. Pure presentational, fixed 1080×1080 inner canvas, scaled down for preview via CSS transform.
- **Render-to-PNG** via `html-to-image` (`toPng`, `toBlob`) — single small dep, works with web fonts and CSS variables (better than `html2canvas` for our gradients/shadows). Add to `package.json`.
- **Clipboard image copy** — `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])` with graceful fallback to download if unsupported (Safari/Firefox quirks → toast + auto-download).
- **Download** — anchor with `download` attribute on object URL.
- **Share intent helpers** — extract the existing X/FB/LinkedIn URL builders into `src/lib/shareIntents.ts` and reuse from both call sites.
- **Caption generator** — lift `generateFullSummary` / `generateTwitterSummary` from `ShareProfileButton` into `src/lib/shareCaptions.ts` and add user-profile + invite variants.
- **Wire-up**:
  - `ShareProfileButton.tsx` → swap dropdown for a single "Share" button that opens the modal in candidate-alignment mode.
  - `QuizResults.tsx` → replace the two sub-menu blocks with two buttons that open the modal in user-profile / invite modes.
- **Design tokens** — all template colors pulled from `hsl(var(--primary))`, `--accent`, `--background`, `--foreground`, `--muted`. Score colors reuse the existing `ScoreText` palette logic.
- **Accessibility** — modal has labeled dialog, keyboard-navigable template selection (radio-group semantics), focus trap from existing `Dialog`.

## Files to add

- `src/components/share/ShareCardModal.tsx`
- `src/components/share/templates/BoldCard.tsx`
- `src/components/share/templates/MinimalCard.tsx`
- `src/components/share/templates/DataCard.tsx`
- `src/components/share/templates/EditorialCard.tsx`
- `src/lib/shareIntents.ts`
- `src/lib/shareCaptions.ts`
- `src/lib/shareImage.ts` (toPng / copy / download helpers)

## Files to edit

- `src/components/ShareProfileButton.tsx` — replace dropdown with modal trigger.
- `src/pages/QuizResults.tsx` — replace dropdown with two modal triggers (results vs invite).
- `package.json` — add `html-to-image`.

## Out of scope

- Server-side OG image generation (can be a follow-up using the same templates rendered in an edge function with Satori).
- Editing/customizing card text inside the modal — templates render from props only.
