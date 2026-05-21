## Problem

The Committee page shows "Committee not found." because two Supabase queries return 400:

1. `candidate_committees.alias_name does not exist` — the column was added to the select but the table has no `alias_name` column.
2. `Could not find a relationship between 'contributions' and 'candidate_id'` — the `contributions` table has no FK to `candidates`, so the embedded `candidates:candidate_id (...)` join is rejected.

## Fix (frontend only — `src/hooks/useCommittees.ts`)

1. **Remove `alias_name` from the `candidate_committees` select** in `fetchCommittees` (line 148). Remove `alias_name` from the `CommitteeRow` type and stop reading it in `buildCommitteeSummaries` (set `aliasName: null`).

2. **Stop embedding `candidates` on `contributions`** in `useCommitteeDonors`:
   - Drop the `candidates:candidate_id (...)` block from the select (lines 479-485).
   - After fetching contribution rows, collect unique `candidate_id`s and run a single `supabase.from('candidates').select('id, name, party, office, state').in('id', ids)` to build a lookup map.
   - Use that map when populating `candidateNames` in the donor aggregation loop.

No database/migration changes. No edits to other files.