## Election Details Modal

Add a clickable election header in `UpcomingElectionsCard` that opens a modal with full details about that race and every candidate.

### UX

- Each election group's date/name row becomes a button. Clicking opens a `Dialog` (shadcn) — no new route needed.
- Modal header: election name, formatted date, level (Federal/State/Local), state/jurisdiction, source attribution.
- Modal body: candidates grouped by office. For each candidate row:
  - Avatar, name, party badge
  - Office + district
  - Incumbent badge (when applicable)
  - Research/score state:
    - `Researching…` (spinner) if `is_pending_research`
    - Score with `ScoreText` + coverage tier badge (tier_1/2/3) + confidence label if available
    - `No data yet` fallback
  - "View full profile →" link to `/candidate/:id`
- Footer: link back to profile, close button.

### Data

The existing `useUpcomingElections` hook already returns everything per candidate (name, party, office, is_incumbent, image_url, overall_score, is_pending_research). To also show **coverage_tier** and **confidence** in the modal, extend the edge function `fetch-upcoming-elections` to include those two fields from the `candidates` table in its candidate payload, and add them to the `UpcomingCandidate` type. Polling continues to update the modal live since it reads the same hook data.

### Files

- New: `src/components/profile/ElectionDetailsDialog.tsx` — controlled `Dialog` taking `election: UpcomingElection`.
- Edit: `src/components/profile/UpcomingElectionsCard.tsx` — local state for `openElection`, make group header a button, render `<ElectionDetailsDialog>`.
- Edit: `src/hooks/useUpcomingElections.ts` — add `coverage_tier` and `confidence` to `UpcomingCandidate`.
- Edit: `supabase/functions/fetch-upcoming-elections/index.ts` — select & return those two fields.

### Out of scope

- Separate `/elections/:id` route (modal only, per request offering "page or modal" — modal is lighter and keeps user in profile context).
- Editing candidate data from the modal.
- Comparison view inside the modal (already available from candidate profile).