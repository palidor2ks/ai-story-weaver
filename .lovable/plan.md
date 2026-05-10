## Problem

Two `candidates` rows exist for Cory Booker (NJ Senate):

| id | name | source |
|---|---|---|
| `B001288` | Cory A. Booker | Congress / bioguide (canonical) — has FEC ID `S4NJ00185`, lis_member_id, all finance + voting data |
| `S4NJ00185` | BOOKER, CORY A. | Created by `fetch-upcoming-elections` from FEC search results |

Both rows independently accumulated 240 `candidate_answers` and 7 `candidate_committees`. `S4NJ00185` is also linked to 2 `election_candidates` rows. All finance (donors, contributions, rollups, reconciliation) lives only on `B001288`.

## Fix — two parts

### 1. One-time data merge (migration)

Keep `B001288`. For `S4NJ00185`:

- `election_candidates`: re-point its 2 rows to `B001288` (skip on conflict with existing election link).
- `candidate_answers` (240) and `candidate_committees` (7): delete — `B001288` already has equivalent rows.
- `candidate_overrides`, `candidate_votes`, `candidate_topic_scores`, `candidate_fec_ids`, `donors`, `contributions`, `committee_finance_rollups`, `finance_reconciliation`, `pac_*`, `external_committee_finance`: nothing to migrate (S4NJ00185 has 0 rows in each).
- Delete the `candidates` row `S4NJ00185`.

### 2. Prevent recurrence in `fetch-upcoming-elections`

In `persistCandidates()` (lines 469-501), before inserting a new candidate using the FEC candidate id as `id`, look up an existing canonical row by `fec_candidate_id`:

```
const { data: byFec } = await supabase
  .from('candidates')
  .select('id')
  .eq('fec_candidate_id', c.fec_candidate_id)
  .maybeSingle();
if (byFec) { c.id = byFec.id; /* use canonical id, skip insert */ }
```

Also reuse the same lookup when `c.id` itself looks like an FEC id (`^[HSP]\d[A-Z]{2}\d+`) so future imports collapse onto the bioguide row.

## Out of scope

- No changes to other duplicate detection (name-key collapse already happens client-side in `useUnifiedCandidates`, but the duplicate appeared because both rows have different `fec_candidate_id`/name spellings and survive client dedup separately).
- No UI changes.

## Deliverables

1. Supabase migration that merges Booker and deletes the duplicate row.
2. Edit to `supabase/functions/fetch-upcoming-elections/index.ts` adding the FEC-id lookup before insert.

After approval I'll run the migration first, then push the edge function fix.