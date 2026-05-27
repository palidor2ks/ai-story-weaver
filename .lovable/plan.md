## Issues

1. **Mobile overflow** — The "Independent Expenditures" target table in `CommitteeIESection` (`src/components/IndependentExpenditureSections.tsx`) renders 5 columns (Target, Supporting, Opposing, Total, Filings). On a 430px viewport this exceeds the card width and the Opposing/Total/Filings columns get clipped off the right edge (visible in screenshot).

2. **GALLREIN not clickable** — Massie links to a candidate profile but Gallrein doesn't. The target row only renders a `<Link>` when `t.candidateId` (our internal UUID) is present. Gallrein's IE rows have a `target_fec_candidate_id` (`H6KY04171`) but no resolved internal `candidate_id`, so the link is skipped even though we likely have a candidate row keyed by `fec_id`.

## Plan

### 1. Make the table fit on mobile

In `src/components/IndependentExpenditureSections.tsx` `CommitteeIESection` table:

- Wrap the `<table>` in a horizontal scroll container: `<div className="overflow-x-auto">` so nothing gets clipped on narrow screens.
- Drop the per-cell `truncate max-w-[260px]` on the Target column and replace with a sensible min-width on the table (`min-w-[560px]`) so columns size naturally and the target name can wrap.
- On mobile, hide the lowest-value column (`Filings`) using `hidden sm:table-cell` on both the header and cell to reduce horizontal pressure. Keep Supporting / Opposing / Total visible (those are the numbers shown in the screenshot).
- Tighten cell padding on mobile (`p-2 sm:p-3` stays; numeric cells use `whitespace-nowrap` so currency amounts like `$6.2M` never wrap mid-value).

Apply the same `overflow-x-auto` + `whitespace-nowrap` numeric treatment to the "Top spending committees" table in `CandidateIESection` for consistency.

### 2. Resolve FEC candidate IDs so targets like Gallrein link

In `src/hooks/useIndependentExpenditures.ts` `useCommitteeIE`:

- After building `targets`, collect every `t.fecId` that has no `candidateId`.
- Reuse the existing `candidates` lookup query (it already fetches `id, fec_id, party` via `or(id.in.(...), fec_id.in.(...))`) and, when populating party, also backfill `candidateId` from the matching row's `id` when the target was matched by `fec_id`. No new query needed.

In `CommitteeIESection` target row:

- Keep current behavior: if `t.candidateId` exists → link to `/candidate/${t.candidateId}`. With the backfill above, Gallrein will now have a `candidateId` and become clickable just like Massie. If a target genuinely has no internal candidate row, it stays plain text (current fallback).

### Scope

UI + a small data-shaping tweak in the existing hook. No schema or backend changes.
