## Goal
Emit lightweight analytics events from the share flow so you can measure which templates, actions, and social destinations drive shares.

## Approach
No analytics provider is wired up yet, so add a tiny abstraction we can later point at PostHog/GA without touching components.

### 1. New file: `src/lib/analytics.ts`
- Export `trackEvent(name: string, props?: Record<string, unknown>)`.
- Implementation: push to `window.dataLayer` if present (GA/GTM-friendly), call `window.posthog?.capture` if present, and always `console.debug('[analytics]', name, props)` in dev. Safe no-op otherwise.
- Define a `ShareEvent` union of names so call sites stay consistent:
  - `share_modal_opened`
  - `share_template_selected`
  - `share_caption_edited` (fired once per modal session when user first edits)
  - `share_hashtags_toggled`
  - `share_action` (action: `copy_caption | copy_image | download | native | open_intent`, destination: `twitter | facebook | linkedin | native | clipboard | file`)

### 2. Wire events in `src/components/share/ShareCardModal.tsx`
- On `open` transition to true → `share_modal_opened` with `{ surface: caption.surface, templateDefault: 'bold' }`.
  - Add an optional `surface` field to `CaptionInput` (e.g. `'quiz_results' | 'candidate_profile'`) passed by the two existing call sites (`QuizResults.tsx`, `CandidateProfile.tsx`).
- When `setSelected` runs from a template tile click → `share_template_selected` with `{ template, surface }`.
- First time `body` diverges from `defaultBody` in a session → `share_caption_edited` (guard with a ref so it fires once).
- On hashtag switch → `share_hashtags_toggled` with `{ enabled }`.
- Copy caption button → `share_action` `{ action: 'copy_caption', destination: 'clipboard', template, surface, includeHashtags, charCount, edited: isEdited }`.
- Copy image button → `share_action` `{ action: 'copy_image', destination: 'clipboard', template, surface }`.
- Download button → `share_action` `{ action: 'download', destination: 'file', template, surface }`.
- Native share button → `share_action` `{ action: 'native', destination: 'native', template, surface }`.
- Twitter / Facebook / LinkedIn buttons → `share_action` `{ action: 'open_intent', destination: 'twitter'|'facebook'|'linkedin', template, surface, includeHashtags, edited }`.

### 3. Surface tagging (small touch in two existing pages)
- `src/pages/QuizResults.tsx`: pass `surface: 'quiz_results'` into the `caption` prop.
- `src/pages/CandidateProfile.tsx`: pass `surface: 'candidate_profile'`.

## Out of scope
- Choosing/installing an analytics SDK (PostHog/GA/Mixpanel). The `trackEvent` shim makes it a one-line swap later.
- Server-side logging or persistence.
- Events outside the share flow.

## Files touched
- add `src/lib/analytics.ts`
- edit `src/components/share/ShareCardModal.tsx`
- edit `src/lib/shareCaptions.ts` (extend `CaptionInput` with optional `surface`)
- edit `src/pages/QuizResults.tsx`, `src/pages/CandidateProfile.tsx` (pass `surface`)
