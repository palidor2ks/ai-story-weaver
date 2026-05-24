# Fix: AI committee-cause classifier silently skips multi-candidate committees

## Root cause

Edge function `classify-committee-topic` logs `No info for C00xxxxxx` and skips the committee. The data IS in `candidate_committees`, but `gatherInfo` reads it with:

```ts
await supabase
  .from('candidate_committees')
  .select('fec_committee_id, name, designation')
  .eq('fec_committee_id', fecId)
  .maybeSingle();
```

`.maybeSingle()` returns `null` data + an error when **more than one row** matches. Many `fec_committee_id`s appear multiple times in `candidate_committees` (one row per authorized candidate — e.g. `C00489567` "ARIZONA MAJORITY COMMITTEE" has 2 rows, `C00489963` "4 FOR SENATE VICTORY" has 2, `C00523985` is a JFC linked to many candidates). For those committees `name` ends up null → the function falls through, can't find a match in `external_pacs` either (joint fundraisers usually aren't in that table), bails with "No info", and never classifies.

Same pattern would also bite `external_pacs` if a duplicate ever appears, and the `independent_expenditures` lookup already uses `.limit(1).maybeSingle()` so it's safe.

## Fix (single file: `supabase/functions/classify-committee-topic/index.ts`)

In `gatherInfo`, replace the two `.maybeSingle()` calls that can legitimately return >1 row with `.limit(1)` array reads:

```ts
const { data: cmteRows } = await supabase
  .from('candidate_committees')
  .select('fec_committee_id, name, designation')
  .eq('fec_committee_id', fecId)
  .limit(1);
const cmte = cmteRows?.[0];
```

```ts
const { data: extRows } = await supabase
  .from('external_pacs')
  .select('name, designation')
  .eq('fec_committee_id', fecId)
  .limit(1);
const ext = extRows?.[0];
```

Keep the existing `independent_expenditures` lookup as-is (already `.limit(1).maybeSingle()`).

## Verification

- Re-run `classify-committee-topic` for `C00489567`, `C00489963`, `C00523985` (currently failing per recent logs) and confirm rows now appear in `committee_topics`.
- Check edge-function logs: "No info for" entries should drop to near-zero (only true unknowns remain).
- No DB / schema changes.

## Out of scope

- Re-classifying already-classified committees (no `force` change needed; new runs will pick them up via the unassigned pool).
- Changing the AI prompt or model.
