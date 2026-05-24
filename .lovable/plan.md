# Candidate Stat Card (Baseball-Style)

Add a new share-card template designed specifically for candidates — modeled on a baseball card's front-of-card stat line. Reuses the existing share modal infrastructure; no backend changes.

## What the card shows

**Header (identity)**
- Avatar (candidate photo, large, top-left)
- Name (display font, large)
- Party chip (D/R/I color)
- Office · State/District
- Incumbent badge + Tier/Confidence dots (small, top-right)

**Hero stat (the "batting average")**
- Pulse Score — huge, formatted L1–R10 with 2 decimals (e.g. `CR2.45`)
- Small label: "Ideology Score"

**3-stat grid (the stat line)**
1. **Match %** — viewer's alignment (falls back to "—" if not signed in)
2. **Voting Record** — votes cast (or party-unity %, whichever data is present)
3. **Outside Spending (latest cycle)** — `↑$X · ↓$Y` with cycle label, reusing data from `useCandidatesIE`

**Footer**
- Top 3 topic scores as mini horizontal bars (topic name + L/R chip)
- Brand host (polipulseapp.com)

## Technical details

**New file:** `src/components/share/templates/CandidateStatCard.tsx`
- 1080×1080, follows the same `forwardRef<HTMLDivElement, { data: CardData }>` pattern as `BaseballCard.tsx`
- Three visual variants (`classic` / `holo` / `night`) reusing `BaseballCard`'s palette tokens for consistency
- Reads from existing `CardData` fields: `candidateName`, `candidateOffice`, `candidateParty`, `candidateImage`, `candidateScore`, `matchScore`, `agreements`, `disagreements`

**Extend `CardData`** in `src/components/share/templates/types.ts` with optional fields:
- `votingRecordPct?: number` (e.g. 97 = "97% votes cast")
- `ieSupport?: string` / `ieOppose?: string` / `ieCycle?: string | null`
- `incumbent?: boolean`
- `coverageTier?: string` / `confidence?: string`

**Wire data** in `src/components/ShareProfileButton.tsx`:
- Pass `incumbent`, `coverageTier`, `confidence` from the `Candidate` object
- Pass IE numbers from `useCandidatesIE` (already used on the candidate profile page)
- Voting record % — pull from existing voting record data if available on the profile, otherwise omit gracefully

**Register the template** in `src/components/share/ShareCardModal.tsx`:
- Add `CandidateStatCard` as a new option under `TEMPLATES_BY_KIND['candidate-alignment']`
- Replace the generic `BaseballCard` slot (or add as a 4th option labeled "Stat Card")

## Out of scope
- No new DB queries or edge functions
- No changes to `BaseballCard.tsx` (used for donor/user/invite kinds)
- Voting-record % stat is best-effort — if data isn't already on the candidate profile page, that slot shows "—" and we can wire it in a follow-up

## Layout sketch

```text
┌─────────────────────────────────────────┐
│ [photo]  NAME (D)              ★ ✓ 🛡   │
│          U.S. Senator · TX              │
│─────────────────────────────────────────│
│                                         │
│              CR 2.45                    │
│           Ideology Score                │
│                                         │
│─────────────────────────────────────────│
│   78%       97%        ↑$4M ↓$10M       │
│  Match    Votes Cast   Outside '24      │
│─────────────────────────────────────────│
│  Economy        ▓▓▓▓▓▓▓░░  CR3          │
│  Healthcare     ▓▓▓▓░░░░░  C            │
│  Immigration    ▓▓▓▓▓▓▓▓░  R2           │
│                       polipulseapp.com  │
└─────────────────────────────────────────┘
```
