## Funding Sources Breakdown — Profile + Baseball Card

Add the bar-chart "Funding Sources" panel (the one from the product video) to the candidate profile page and to the shareable Baseball Card. Presentation-only — no new data sources or business logic.

### What gets added

**1. New component `src/components/FundingSourcesBreakdown.tsx`**

Reusable presentation component that renders the dark panel with 4 horizontal bars:

```text
FUNDING SOURCES · {CYCLE}
Individual Donors     ████████████████░░░░  68%
PACs & Committees     ████░░░░░░░░░░░░░░░░  18%
Industry / Orgs       ██░░░░░░░░░░░░░░░░░░   9%
Self-Funding          █░░░░░░░░░░░░░░░░░░░   5%
```

Props: `{ sources: { label: string; amount: number; color: string }[]; cycleLabel?: string; variant?: 'panel' | 'compact' }`. Computes percentages off the sum. Empty rows hidden. Uses semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`, `text-primary`) so it matches the rest of the app theme (not raw hex like the video).

**2. Helper `src/lib/fundingBreakdown.ts`**

Single pure function `computeFundingBreakdown(input)` that maps the already-derived FEC values on CandidateProfile into the 4 buckets:

| Bucket | Source |
|---|---|
| Individual Donors | itemized non-PAC donor sum + `fecUnitemized` |
| PACs & Committees | itemized PAC donors + `fecTransfers` |
| Industry / Organizations | itemized organization donors |
| Self-Funding | `fecLoans` + `fecCandidateContribution` |

Returns `{ sources, cycleLabel, total }`. Used by both the profile page and the share button so the numbers always match.

**3. CandidateProfile.tsx**

Insert `<FundingSourcesBreakdown … />` directly under the existing "All Contributors & Funding Sources" summary block (~line 733), before the donor search input. No changes to surrounding logic.

**4. Share data — `src/components/share/templates/types.ts`**

Extend `CardData` with:

```ts
fundingBreakdown?: { label: string; pct: number; color: string }[];
fundingCycle?: string;
```

**5. ShareProfileButton.tsx**

Add new optional prop `fundingBreakdown?: { label: string; amount: number; color: string }[]` + `fundingCycle?: string`, pass through to `ShareCardModal` data payload. CandidateProfile passes the same computed breakdown so the share card mirrors what the user sees.

**6. BaseballCard.tsx**

When `isCandidate && data.fundingBreakdown?.length`, replace the existing bottom "Compared Topics" stat tile row's third cell with a compact 4-bar funding mini-chart, OR add a 4th row below the 3-stat grid. Decision: **add a 4th row** (keeps existing 3 stats intact) — a slim panel with 4 horizontal bars + label + percent on the right, sized for the 1080×1080 card. Stays inside the existing card chrome and color variants (classic/holo/night) by using `v.border` and `mutedColor` for chrome and the per-bucket color for the bar fill.

### Out of scope

- No new FEC queries, no schema changes, no scoring changes.
- Other share templates (`BoldCard`, `MinimalCard`, `EditorialCard`, `DataCard`) are not modified in this pass — only `BaseballCard` per the request.
- Donor profile / user profile share variants are unchanged.

### Files touched

- New: `src/components/FundingSourcesBreakdown.tsx`, `src/lib/fundingBreakdown.ts`
- Edited: `src/pages/CandidateProfile.tsx`, `src/components/ShareProfileButton.tsx`, `src/components/share/templates/types.ts`, `src/components/share/templates/BaseballCard.tsx`
