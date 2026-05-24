# Show candidate party in committee Independent Expenditures table

Add a party indicator next to each target candidate name in the `CommitteeIESection` table (the screenshot's "MORENO, BERNIE", "PELTOLA, MARY", etc.).

## Changes

**`src/hooks/useIndependentExpenditures.ts`** — in `useCommitteeIE`, after aggregating `targets`, fetch parties in one query:
- Collect all `candidateId`s and all `fecId`s from targets.
- `supabase.from('candidates').select('id, fec_id, party').or('id.in.(...),fec_id.in.(...)')`.
- Build a lookup and attach `party` (string | null) to each target row.

**`src/components/IndependentExpenditureSections.tsx`** — in the committee target row:
- Render a small colored Party `Badge` next to the target name (Democrat blue, Republican red, Independent purple, others muted), reusing the existing party color pattern from `RepresentativeComparisonCard`. Show only when `t.party` is set.

No backend/schema changes.
