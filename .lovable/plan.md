## Goal
Reduce visual clutter by converting text+icon action buttons to icon-only across the app, and tighten card layouts so they adapt better to small screens.

## Scope

### 1. Icon-only action buttons
Convert these action buttons (currently icon + label) to icon-only with tooltips for accessibility:

- **Candidate profile header** (visible in screenshot): Edit, Claim This Profile, AI Analysis, Share
- **Recipient profile header**: equivalent action row
- **Donor profile header**: equivalent action row
- **Bill detail header**: equivalent action row
- Any other profile/detail header action rows that follow the same pattern (Refresh, Regenerate, Copy, Export)

Implementation:
- Use shadcn `Button` with `size="icon"` and `variant="outline"`.
- Wrap each in `Tooltip` so the label still appears on hover/long-press.
- Add `aria-label` matching the removed text for screen readers.
- Keep the same click handlers and ordering.

Out of scope: primary CTAs in forms ("Save", "Submit", "Sign in"), nav links, and buttons inside tables/lists that already rely on text.

### 2. Responsive card refit
On the same profile cards (candidate score card, AI Stance Analysis card, and sibling cards on donor/recipient/bill profiles):

- Replace fixed paddings (`p-6`, `p-8`) with responsive `p-4 sm:p-6`.
- Let the score row wrap: `flex-col sm:flex-row` with `gap-3`, so "R6.09 / RIGHT-LEANING" and "22% MATCH WITH YOU" stack cleanly on narrow screens instead of crowding.
- Constrain the big score number with responsive type (`text-4xl sm:text-5xl`) so it doesn't dominate mobile width.
- Action button row becomes `flex flex-wrap gap-2` (now trivial since icons are small).
- Ensure cards use `w-full` and the page container uses `max-w-screen-md mx-auto px-4` consistently.

### 3. Verification
After changes, open the candidate, donor, recipient, and bill profiles in the preview at mobile and desktop widths to confirm:
- Buttons show icon only with working tooltip.
- Cards no longer overflow or feel cramped at 375px.
- No regressions on desktop spacing.

## Technical notes
- Files likely touched: `src/components/candidate/CandidateProfileHeader.tsx` (or equivalent), donor/recipient/bill header components, and the shared score card component. Will confirm exact paths during build.
- Tooltip provider is already mounted globally in this project; no new setup needed.
- No backend, data, or business-logic changes.