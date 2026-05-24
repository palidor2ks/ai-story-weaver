# Stat Card v2 — Flag Colors, Donors & Spenders

Refine `CandidateStatCard` based on feedback. No backend changes.

## Visual changes (`src/components/share/templates/CandidateStatCard.tsx`)
- **Remove diagonal stripe pattern** entirely (`repeating-linear-gradient`).
- **Tighter US-flag palette**: navy → red gradient backdrop, white inner border, white star accents. No purple/holo/night variants needed for this card — render a single flag-themed look.
- Keep ideology hero, name/photo row, footer.

## Stat layout changes
Replace the 3-stat grid with two focused sections:

**Outside Spending strip** (top, 2 columns)
- Top 2 spending committees for the latest cycle
- Each: committee name, ↑support / ↓oppose amounts
- Heading: `Top Outside Spenders · {cycle}`

**Top Donors strip** (below, single row of 3)
- Top 3 donor names + amount
- Heading: `Top Donors · {cycle}`

If a section is empty, hide it gracefully and let the ideology hero + topics take the space.

## Data wiring

**`CardData`** (`src/components/share/templates/types.ts`) — add:
- `topDonors?: { name: string; amount: number }[]`
- `topSpenders?: { name: string; support: number; oppose: number }[]`
- Remove unused: `votingRecordPct`, `ieSupport`, `ieOppose` (keep `ieCycle` for label)

**`ShareProfileButton.tsx`**
- Drop `votingRecordPct` prop and `matchScore`-as-stat usage (keep matchScore in `CardData` for other templates that still use it).
- Call `useCandidateIE(candidateId, latestCycle)` to get `topSpenders` (slice 2) and cycle.
- Accept new `topDonors` prop (computed by the candidate profile page from the donors it already loads).

**`CandidateProfile.tsx`**
- Compute top 3 donors from existing `donors` array (aggregate by `display_name || name`, exclude conduits, sort by amount desc, slice 3) and pass to `ShareProfileButton`.

## Out of scope
- No new DB queries beyond the existing `useCandidateIE` already used elsewhere.
- Other templates (Patriot Card, Issue Breakdown, Editorial) untouched.
