## Goal

On the donor profile (e.g. Harris Victory Fund) add a cycle filter that scopes both the "Top Contributors to this PAC" and "Top Recipients" sections, and fix horizontal overflow on mobile.

## Changes — `src/pages/DonorProfile.tsx`

### 1. Shared cycle filter state

- Add `const [profileCycleFilter, setProfileCycleFilter] = useState<string>('all')`.
- Derive `profileAvailableCycles` from the union of cycles found in `donorRecords`, `contributions`, and `pacContributors` byCycle keys (sorted desc).

### 2. Top Contributors — per-cycle breakdown

In the `pac-contributors` query (around L311):
- Add `cycle` to the `.select(...)` from `donors`.
- Group results so each contributor has `byCycle: Record<string, { totalAmount: number; contributionCount: number }>` plus the existing overall totals.
- Extend `PACContributor` type with `byCycle`.

Derive `filteredPacContributors`:
- If `profileCycleFilter === 'all'`, use existing totals.
- Otherwise map each contributor to its `byCycle[profileCycleFilter]`, drop empties, re-sort desc.

### 3. Top Recipients — cycle scoping

`topRecipients` (L347–388) already aggregates from `contributions` / `donorRecords`. Add a cycle gate inside the `useMemo`:
- When `profileCycleFilter !== 'all'`, filter `contributions` to `c.cycle === profileCycleFilter` (and fallback `donorRecords` to `r.cycle === profileCycleFilter`) before grouping.
- Empty-state copy when no recipients match the cycle.

### 4. UI — section headers

Render the cycle Select once, at the top of the donor profile (just below the donor header card / above the first of the two sections) so it visibly controls both. Layout: `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`, label "Filter by cycle" + Select. Only render when `profileAvailableCycles.length > 1`. Options: "All cycles" + each cycle.

Both section headers (`Top Contributors to this PAC` count, `Top Recipients`) reflect the filtered length / show the cycle-scoped empty state.

The bottom "Contribution History" panel keeps its own existing `cycleFilter` / committee / date filters — independent and unchanged.

### 5. Mobile overflow fix

The screenshot shows the entire page pushed off-screen on iOS Safari. Audit and fix:
- Add `min-w-0` to the outer column wrappers in the donor header card so long names / name-variation chips can't force a horizontal scroll.
- Ensure the name-variations strip (`HARRIS VICTORY FUND - UNITEMIZED`, etc.) uses `flex-wrap` with `min-w-0` so chips wrap instead of overflowing.
- In both Contributor and Recipient cards, keep `min-w-0` on the name column and add `flex-shrink-0` on the amount + AI button cluster so `$1.9M AI` never expands the card past its grid track.
- Wrap the page's outermost `<div>` with `overflow-x-hidden` as a safety net.
- Spot-check at 375px and 430px — no horizontal page scroll.

### Technical notes

- Cycle filter is in-memory; no extra network calls for Contributors (data already present once `cycle` is added to select). Recipients reuse the already-fetched `contributions` / `donorRecords`.
- Per-cycle Contributor totals come from the same `donors`-table rows that power the section today.
- No schema changes, no edge function changes.

## Verification

- At 430px viewport, donor profile shows a single "Filter by cycle" Select above the two sections; changing it updates both Contributors and Recipients counts, ordering, and cards.
- "All cycles" matches the current totals.
- No horizontal page scroll at 375px or 430px.
- Contribution History panel below still works with its own filters independently.
