
# Fix Local Topics Appearing in Admin for Federal Candidates

## Problem
The 5 new local-only topics (Local Education, Local Housing, etc.) appear in:
1. **Answer Management dialog** — shows all 17 topics for every candidate, including federal senators like Cory Booker who should only see the 12 federal topics
2. **Admin sync stats/chart** — counts all 340 questions (17 topics x 20) as the denominator for coverage, deflating coverage percentages for federal candidates

## Root Cause
Both `CandidateAnswersDialog` and `useSyncStats` query `topics` without filtering by `scope`.

## Fix

### 1. CandidateAnswersDialog — scope-aware topic loading
The dialog already receives the `candidateId`. We'll:
- Look up the candidate's office from `candidates` or `candidate_overrides`
- Determine if local (governor+below) using the same office keyword list as the edge functions
- Filter topics query to `scope = 'local'` for local officials, `scope = 'all'` for federal

### 2. useSyncStats — separate federal and local stats
- Filter questions and topics by `scope = 'all'` for the main stats (since the candidates table only has federal candidates)
- Add a separate local coverage section if needed, or simply exclude local topics from the main chart since no federal candidates have local answers

### 3. CandidateAnswersPopover (if applicable)
- Check if the popover also loads all topics and apply the same scope filter

No database changes needed — this is purely frontend filtering.
