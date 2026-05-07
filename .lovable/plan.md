## Merge Civic Officials into Main Candidates Table

Remove the separate "Civic Officials" tab and integrate state/local officials directly into the existing Answer Coverage panel (the main candidates table with filters).

### Changes

#### 1. Expand `useCandidatesAnswerCoverage` hook to include civic officials

Currently queries only `candidates` table. Add a parallel query to `candidate_overrides` for civic official records (`openstates_%`, `nj_%`, etc.), then merge them into the same `CandidateAnswerCoverage[]` array.

Civic officials won't have FEC data, vote sync data, or committee data — those fields will default to zero/null. They will have answer counts from `candidate_answer_coverage_stats` (same table used for federal candidates).

Add a new field `source: 'federal' | 'civic'` to `CandidateAnswerCoverage` so the UI can distinguish them.

#### 2. Add a "Level" filter to `AnswerCoveragePanel`

Add a new filter dropdown: `Level: All | Federal | State Executive | State Legislature | Local` so admins can filter by government level. This replaces the need for a separate tab.

#### 3. Add the AI Research (🧠) button to the table rows for civic officials

Move the "Populate Answers" action from the separate panel into the existing table's action menu. For civic officials, show the Brain icon to trigger `populate-civic-answers`. Federal candidates keep their existing Congress.gov sync action.

#### 4. Remove the "Civic Officials" tab from Admin.tsx

Remove the `TabsTrigger` and `TabsContent` for `civic-officials`, and the `CivicOfficialsPanel` import.

### Technical Details

- `candidate_overrides` has: `candidate_id`, `name`, `party`, `office`, `state`, `district`, `overall_score`, `is_active`
- The merge will union federal candidates (from `candidates` table) with civic officials (from `candidate_overrides` where `candidate_id` matches civic patterns)
- Civic officials will show "N/A" for FEC-specific columns (donor count, committee count, finance data)
- A `Badge` or icon will distinguish civic officials from federal candidates in the table
