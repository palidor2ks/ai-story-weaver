## Goal
In the candidate "Outside Spending → Top spending committees" table, make each spender clickable so it navigates to that committee's profile.

## Change
In `src/components/IndependentExpenditureSections.tsx` (`CandidateIESection`, top-spenders table rows):

- Wrap the committee name in a `<Link to={`/committee/${s.fecId}`}>` with the existing hover styles (`hover:text-primary hover:underline`).
- Also wrap the `{s.fecId}` text in the sub-line with the same link so the FEC ID is clickable.
- Keep the topic badge outside the link so it stays its own pill.
- If `s.fecId` is missing, render as plain text (no link).

No route changes (`/committee/:id` already exists in `App.tsx`). No data or API changes.
