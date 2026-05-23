## Goal

Keep super PAC / IE-only / JFC donors visible on the candidate donor list (so $1M from Lonsdale Enterprises to AMERICA PAC still appears under Trump), but visually flag them so users immediately see the money went to a supporting outside committee, not the candidate's direct campaign.

## What changes

### 1. Donor query — carry committee designation through aggregation

In `src/hooks/useCandidates.ts` (`useCandidateDonors`):
- After fetching raw donors, also fetch `candidate_committees` rows for that candidate (`fec_committee_id`, `name`, `designation`, `role`) and build a map keyed by `fec_committee_id`.
- When grouping donors by canonical name + cycle, collect a `recipient_committees` array of `{ committee_id, committee_name, designation, role }` for each unique recipient.
- Compute two derived flags per grouped donor:
  - `via_committees`: list of distinct non-principal recipients (designation in `O`, `U`, `D`, `J`, `B` — i.e. anything that isn't `P` Principal / `A` Authorized for this candidate).
  - `is_external_only`: true when **every** contribution for this donor went through a non-principal/non-authorized committee.

### 2. DonorCard — render badge

In `src/components/DonorCard.tsx`:
- Add optional props: `viaCommittees?: { name: string; designation: string }[]`, `isExternalOnly?: boolean`.
- When `viaCommittees` is non-empty, render a small badge under the donor name:
  - `is_external_only` and one committee → `via AMERICA PAC · Super PAC`
  - `is_external_only` and multiple → `via 3 outside committees`
  - mixed (gave to both direct + outside) → `+ via AMERICA PAC` (muted, smaller)
- Use a neutral/amber badge style (not the donation-amount green) so it reads as a caveat, not a stat.
- Map designation → label: `O` Super PAC, `U` Unauthorized, `D` Leadership PAC, `J` JFC, `B` Lobbyist/Registrant PAC, fallback "Outside committee".

### 3. Wire it through CandidateProfile donor list

In `src/pages/CandidateProfile.tsx` where DonorCards are rendered from `donors`, pass the new fields.

## Out of scope

- No backend / RPC changes; designations already exist in `candidate_committees`.
- No change to donor totals, reconciliation, or DonorProfile page.
- No change to how super PAC donors are *counted* in finance summaries — purely a label on the donor card.

## Files touched

- `src/hooks/useCandidates.ts` — enrich `useCandidateDonors` result with `via_committees` / `is_external_only`.
- `src/components/DonorCard.tsx` — new props + badge.
- `src/pages/CandidateProfile.tsx` — pass new props through.
