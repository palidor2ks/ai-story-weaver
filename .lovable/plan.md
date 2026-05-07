
## Problem

When a user's civic officials are fetched (via Open States / GitHub), the results are returned ephemerally and never saved. Each user hitting the same officials triggers redundant lookups, and no `candidate_answers` are ever generated for these officials — meaning comparisons can't work.

## Plan

### 1. Persist officials to `candidate_overrides` in `fetch-civic-officials`

After assembling the officials list, upsert each official into `candidate_overrides` (using service role) with:
- `candidate_id` = the official's ID (e.g. `openstates_ocd-person_...`)
- `name`, `party`, `office`, `state`, `district`, `image_url`
- `is_active = true`
- Skip if the record already exists (upsert on `candidate_id`)

This ensures the official is discoverable by other users and the comparison system.

### 2. Queue AI answer population for new officials

After persisting, check which officials do NOT yet have `candidate_answers`. For those, call `populate-candidate-answers` in the background (via `EdgeRuntime.waitUntil`) to research and store their positions using the existing Perplexity deep-research pipeline.

To avoid blocking the response, the answer population runs as a background task. A `last_answers_sync` timestamp on `candidate_overrides` prevents re-processing.

### 3. Update `useCandidateAnswers` hook to also check `candidate_overrides`

Currently `useCandidateAnswers` may only look up candidates in the `candidates` table. Ensure it also resolves officials stored in `candidate_overrides` so the comparison card can find their answers.

### Technical details

**Edge function changes** (`fetch-civic-officials/index.ts`):
- After line ~727, add a `persistOfficials()` call using service role client
- Upsert into `candidate_overrides` table (already has the right schema: `candidate_id`, `name`, `party`, `office`, `state`, `district`, `image_url`)
- For officials without answers, invoke `populate-candidate-answers` in background

**No migration needed** — `candidate_overrides` already has all required columns.

**No frontend changes needed** — `useCandidateAnswers` already queries by `candidate_id` which matches the IDs used for civic officials.
