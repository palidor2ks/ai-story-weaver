## Goal

Let the user tailor the share caption from inside the share modal before they copy it or trigger a social share, with two simple controls:

1. **Custom message** — editable textarea seeded with the auto-generated caption.
2. **Suggested hashtags toggle** — switch that appends/removes the suggested hashtags (e.g. `#Pulse #VoterMatch`) at the end.

## Where it applies

`src/components/share/ShareCardModal.tsx` only. Both Quiz Results and Candidate alignment flows pick this up automatically since they share the modal.

## UX

Add a "Caption" section between the big preview and the action buttons:

```text
[ Caption ]
┌──────────────────────────────────────────────┐
│ My alignment with JD Vance: 78% match | ...  │  ← editable textarea (4 rows)
└──────────────────────────────────────────────┘
[ Switch ] Include suggested hashtags    #Pulse #VoterMatch

[ Reset to suggested ]   (small ghost link, only shows if user edited)
```

- Textarea is the single source of truth for what gets copied/shared.
- Toggle ON → hashtags string is appended (with a leading newline) to whatever the user typed.
- Toggle OFF → hashtags removed from outgoing text.
- "Reset to suggested" restores the auto-generated caption (and re-enables hashtags if off).
- Character counter underneath (helpful for X — show `n / 280`, turn amber over 240, red over 280, but never block submission).

## Behavior wiring

- The existing `generateShortCaption(caption)` and `generateLongCaption(caption)` helpers stay. The modal now treats them as **defaults**:
  - `defaultBody` = `generateShortCaption(caption)` (concise; works for X and the user can expand it).
  - `defaultHashtags` = derived per `caption.kind` from a new constant in `shareCaptions.ts`:
    - `candidate-alignment` → `#Pulse #VoterMatch`
    - `user-profile` → `#Pulse #VoterMatch`
    - `invite` → `#Pulse`
- New local state in the modal: `body: string`, `includeHashtags: boolean` (default `true`).
- `finalText = includeHashtags ? \`${body}\n\n${hashtags}\` : body` (trim trailing whitespace; collapse if `body` empty).
- All existing handlers (`handleCopyCaption`, `openIntent(twitterIntent(finalText, url))`, `openIntent(facebookIntent(url, finalText))`, `nativeShare({ text: finalText, ... })`) use `finalText` instead of `shortText`/`longText`.
- LinkedIn intent unchanged (it doesn't accept text via URL).
- Image rendering is **not** affected — cards stay templated, only the caption text changes.

## Tiny additions to `src/lib/shareCaptions.ts`

- Export `getDefaultHashtags(input: CaptionInput): string`.
- Keep `generateShortCaption` / `generateLongCaption` intact; remove the trailing `#Pulse ...` lines from the long variant so hashtags aren't duplicated when the toggle is on (they only come from `getDefaultHashtags`).

## Out of scope

- Per-template caption presets.
- Saving the user's custom caption between sessions.
- Editing image text inside the cards.
