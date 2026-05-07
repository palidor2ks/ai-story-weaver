
## Problem

Civic officials added via the Open States API (e.g. Kevin Egan) are persisted to `candidate_overrides` but with NULL values for name, party, office, and state. This is caused by the upsert using `ignoreDuplicates: true`, which skips updates on existing records. Additionally, these officials aren't visible in the main Candidates tab on the admin page — they only appear in the Overrides tab as blank rows.

## Fix 1: Fix the upsert to actually save data

In `fetch-civic-officials/index.ts`, change `ignoreDuplicates: true` to `ignoreDuplicates: false` so that when a civic official record already exists, it gets updated with the correct name/party/office/state data.

Also fix the 4 existing broken records in the database by running an update.

## Fix 2: Show civic officials in admin Candidates management

Add civic officials (from `candidate_overrides` where `candidate_id` starts with `openstates_`) to the admin's main candidate management view alongside senators and representatives. This involves:

- In the Admin page, merge data from `candidates` table with civic-official records from `candidate_overrides` into a unified candidate list
- Add a "Source" badge (e.g. "Civic API", "Federal") so admins can distinguish data origins
- Link each row to the existing `/candidate/:id` profile page for editing
- Add filtering by source type

This lets admins manage local/state officials with the same tools used for federal candidates — viewing answers, triggering research, editing profiles, etc.
