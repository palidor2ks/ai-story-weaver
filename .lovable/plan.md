## Goal
Group the Feed page's representative cards into the same sections used on the Profile page, instead of one flat grid.

## Sections (in order)
1. **Federal Executive** — President, Vice President
2. **U.S. Congress** — Senators + House Representatives (from Congress API)
3. **State Executive** — Governor, Lt. Governor, AG, etc.
4. **State Legislature** — State Senate / Assembly
5. **Local Officials** — Mayor, City Council, etc.

Each section renders only when it has at least one card. Section header matches Profile's style: small uppercase muted heading with `Building2` / `MapPin` icon and a count badge.

## Behavior
- Search, party filter, incumbent filter, and sort all continue to apply — they just operate within each section.
- The existing Federal/State/Local **tabs** remain. Selecting a specific tab hides the other section groups (e.g. "Federal" shows only Federal Executive + U.S. Congress sections).
- Card layout inside each section stays the responsive grid (`md:grid-cols-2 lg:grid-cols-3`) so it still looks like the current Feed, just chunked.
- Empty-state message only appears when *all* sections are empty.

## Implementation (single file: `src/pages/Feed.tsx`)
1. After `filteredAndSortedCandidates` is built, derive a `groupedCandidates` object by classifying each candidate's `level` + `office`:
   - Federal Executive: office matches `/president|vice president/i`
   - U.S. Congress: `level === 'federal'` and not exec
   - State Executive: `level === 'state'` and office matches `/governor|lieutenant|attorney general|secretary of state|treasurer|comptroller/i`
   - State Legislature: `level === 'state'` and remaining
   - Local: `level === 'local'`
2. Replace the single `<div className="grid …">{map}</div>` with a `sections` array rendered in order, each as `<section>` with header + grid.
3. Reuse `CandidateCard` as-is. No business-logic changes.

## Out of scope
- No changes to data fetching, scoring, or filtering logic.
- No changes to Profile page or shared components.