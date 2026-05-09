## Goal
On the Quiz Results page, change the **Share Results** dropdown so the user first picks one of two share modes, then sees the social/copy options for that mode.

## Two modes

1. **Share my results** (existing behavior)
   - Text includes their score + label, e.g. *"I just discovered my political profile! My score: L4.25 (Center-Left). Find out where you stand."*
   - Links to the results URL.

2. **Invite others to take the quiz** (new)
   - No personal scores included.
   - Generic encouraging text, e.g. *"I just took the Pulse political alignment quiz — it shows where you really stand on the issues. Take it and see your results:"*
   - Links to the app's quiz/landing URL (not the user's personal results URL).

## UX

In `src/pages/QuizResults.tsx`, replace the current single dropdown with a two-step dropdown:

- Top level shows two items:
  - **Share my results** →
  - **Invite others to take the quiz** →
- Each opens a sub-menu with: Copy link, Share on X, Share on Facebook, Share on LinkedIn, and native Share (when available).

Use `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent` from the existing `dropdown-menu` component (already in the project).

## Technical details

- Add a second pair of strings: `inviteShareText` and `inviteShareUrl` (the quiz landing URL, e.g. `${window.location.origin}/` or `/quiz`).
- Refactor the four handlers (`handleCopyLink`, `handleShareTwitter`, `handleShareFacebook`, `handleShareLinkedIn`, `handleNativeShare`) to accept `(text, url)` parameters, then bind them per mode in the menu.
- No backend, scoring, or data changes. Pure UI in `QuizResults.tsx`.

## Open question

For the invite link, should it point to:
- the site root (`/`), or
- a dedicated quiz entry route (e.g. `/quiz` or `/onboarding`)?

Default: site root unless you say otherwise.