
## Problem

JD Vance's candidate record uses ID `S001236` (a Senate LIS-style ID), but the Congress API identifies him by bioguide ID `V000137`. The Feed page sources representatives from the Congress API (using `V000137`), then tries to look up scores and answers using that ID — finding nothing, since all 140 answers and the candidate record are stored under `S001236`.

The admin page queries the `candidates` table directly and shows the correct score for `S001236`.

## Fix

Run a migration to:

1. Update `candidate_answers` rows from `candidate_id = 'S001236'` to `'V000137'`
2. Update `candidate_overrides` (if any) similarly
3. Update `candidate_topic_scores` similarly
4. Update `candidate_votes` similarly
5. Update `candidate_committees` and `candidate_fec_ids` similarly
6. Update the `candidates` table row: change `id` from `S001236` to `V000137`

Since `id` is a primary key on `candidates`, we'll need to insert a new row with `V000137` and delete the old `S001236` row (or use a temporary approach).

## Technical Details

- Single SQL migration handling all related tables
- No code changes needed — the Feed's name-based merge and scoreMap lookups will work correctly once IDs align
