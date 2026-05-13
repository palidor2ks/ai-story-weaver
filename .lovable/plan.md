## Add interactive results & vote totals to public Poll page

Enhance `src/pages/Poll.tsx` (and tally hook) to show richer charts and total response counts after submission, plus a public "Results" view.

### Changes

**1. `usePolls.ts` — `usePollTally`**
- Also fetch total response count from `poll_responses` (`select count`) for the poll.
- Return `{ rows, totalResponses }`.
- Make hook usable without `submitted` gate when `enabled` flag passed (for results view).

**2. `src/pages/Poll.tsx` (post-submit results section)**
- Add a stats header card: **Total responses**, **Questions answered**, **Last updated** (animated count-up via simple state).
- Replace inline % bars with a richer per-question results card:
  - For each question, render a horizontal bar chart using `recharts` `BarChart` (already a shadcn dep) with option text on Y axis and vote count on X axis.
  - Highlight the user's selected option bar in `--primary`; others in `--muted-foreground/40`.
  - Show count + % label at the end of each bar.
  - For `scored` / `mini_quiz` polls, also show a small score-distribution strip: a horizontal line from -10 → +10 with a marker per option sized by vote share, so users can see the ideological spread of responses.
- Keep the existing tap-to-vote buttons but collapse them once submitted; results card takes their place.
- Add subtle Framer Motion fade/slide-in for results.

**3. Public results route (no vote required)**
- Add link "View results without voting →" under the Submit button.
- New route `/p/:slug/results` rendering the same results card stack + share card, reusing the new `<PollResults />` component extracted from Poll.tsx.
- Wire route in `src/App.tsx`.

**4. New file: `src/components/poll/PollResults.tsx`**
- Props: `poll`, `questions`, `tally`, `totalResponses`, `userAnswers?`.
- Owns the chart rendering so both `/p/:slug` (post-submit) and `/p/:slug/results` use it.

### Technical notes
- Uses existing `recharts` (shadcn `chart.tsx`).
- No DB migration; `get_poll_tally` already returns counts. Total responses = `select count from poll_responses where poll_id = ...` (RLS already permits public read of aggregates via the existing tally RPC; if `poll_responses` isn't publicly readable, add a tiny `get_poll_response_count` RPC — will confirm during implementation and add migration only if needed).
- All colors via semantic tokens (`hsl(var(--primary))`, `hsl(var(--muted))`).

### Out of scope
- Per-demographic breakdowns, time-series charts, CSV export, admin analytics dashboard.
