## Problem
The screenshot shows three issues in the share-card modal:

1. **Previews are clipped.** Tiles render the 1080×1080 card scaled by a fixed `0.27`, but the actual tile width at the current viewport is ~210px. The scaled card is ~291px so the right/top edges get cut off ("…4.21", "issues" half-shown, "R" cropped, Editorial overflowing).
2. **The label chip overlaps the card.** "Bold" / "Minimal" / "Data" / "Editorial" sit on top of the artwork instead of below it.
3. **No real app icon.** Three templates show a placeholder "P" tile or just the word "Pulse"; the project ships a real icon at `public/icon-512.png` that should be used.

## Fix

### 1. Preview tiles in `ShareCardModal.tsx`
- Replace the fixed `PREVIEW_SCALE = 0.27` with a fit-to-container approach: render the preview wrapper at a known square size (e.g. `220px`) and scale `1080 → 220` (`scale = 220/1080`), with `transformOrigin: 'top left'`. The wrapper sits in a `aspectRatio: 1/1` tile so it can never overflow.
- Move the template label out of the card overlay. Layout becomes:
  ```text
  ┌─────────────┐
  │   preview   │  ← square, no overlay
  ├─────────────┤
  │ Bold      ✓ │  ← caption row under the tile
  └─────────────┘
  ```
  Selected state stays as the primary border + ring on the tile, plus the check icon inline with the label.
- Add a subtle inner shadow / 1px ring on the preview so cards with white backgrounds (Minimal, Editorial-right) still read as a card.

### 2. App icon
- Add a shared `<PulseMark />` helper used by all four templates that renders `/icon-512.png` as an `<img>` (same-origin, safe for `html-to-image`) with a rounded-square frame. Falls back to the "P" glyph if the image fails to load.
- Wire it into:
  - **BoldCard** — replaces the white "P" tile next to the "Pulse" wordmark.
  - **MinimalCard** — small icon left of the top "PULSE" eyebrow.
  - **DataCard** — small icon left of the "PULSE · Voter Alignment" eyebrow.
  - **EditorialCard** — small icon left of the "PULSE · …" eyebrow on the right column. Also overlay the icon as a small badge over the portrait band so the brand stays visible when a candidate photo fills it.

### 3. Alignment polish (small)
- Standardise eyebrow row across Minimal/Data/Editorial: same icon size (48px), same gap (16px), same letter-spacing.
- Bold: tighten the bottom row so the "My position …" line and the brand host align to the same baseline.
- Editorial: clamp the headline to `lineHeight: 1.05` and reduce font-size to `72` so long quotes (e.g. "My pulse: L4.21 — Left-Leaning.") don't wrap awkwardly.
- Data: align the right-side score pill vertically to the candidate name (currently top-aligned with the eyebrow).

## Out of scope
- No changes to caption text, analytics, or share intents.
- No new template designs — just fixing fit, alignment, and branding of the four existing ones.

## Files touched
- edit `src/components/share/ShareCardModal.tsx` (tile layout + scaling)
- add `src/components/share/templates/PulseMark.tsx`
- edit all four templates: `BoldCard.tsx`, `MinimalCard.tsx`, `DataCard.tsx`, `EditorialCard.tsx`
