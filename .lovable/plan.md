
## Problem

Mikie Sherrill appears twice in the admin AnswerCoveragePanel because she exists as two separate records:
- **`candidates` table**: `S001207` — Representative, 240/340 answers, Tier 1
- **`candidate_overrides` table**: `nj_governor_sherrill` — Governor, 11/340 answers, Tier 3

The AnswerCoveragePanel merges both sources but only deduplicates by ID (which differs). This will happen for any politician who changes office.

## Plan

### 1. Database: Add `prior_offices` column to `candidate_overrides`

Add a JSONB column `prior_offices` to `candidate_overrides` to store historical positions:
```json
[
  { "office": "Representative", "state": "NJ", "district": "11", "start_year": 2019, "end_year": 2025, "candidate_id": "S001207" }
]
```

### 2. Data migration: Merge Sherrill's records

- Update the `candidate_overrides` record for `nj_governor_sherrill`:
  - Set `prior_offices` with her Representative history
  - Migrate her 240 answers from `S001207` to `nj_governor_sherrill` (re-key the `candidate_id`)
  - Copy her image, score, and other data from the federal record
- Mark `S001207` in `candidates` as no longer incumbent (`is_incumbent = false`)

### 3. Frontend: Dedup logic in AnswerCoveragePanel

Update the dedup check in `useCandidatesAnswerCoverage.ts` (line ~549) to also match by name + state, so that civic officials who were formerly in the `candidates` table don't appear twice. If a civic override exists for the same person, prefer the override (current role) and hide the old federal record.

### 4. Frontend: "Prior Positions" section on CandidateProfile

Add a section to the candidate profile page that reads `prior_offices` from the override and displays prior roles (e.g., "US Representative, NJ-11 (2019-2025)").

### 5. Admin: Merge tool (future)

For now this will be a manual data operation. A general-purpose merge tool can be added later as more transitions occur.

---

### Technical details

**Migration SQL:**
- `ALTER TABLE candidate_overrides ADD COLUMN prior_offices JSONB DEFAULT '[]'`

**Data update (via insert tool):**
- Update `nj_governor_sherrill` override with prior_offices, merged score data
- Update `candidate_answers` to re-key 240 answers from `S001207` to `nj_governor_sherrill`
- Set `candidates.is_incumbent = false` for `S001207`

**Dedup logic:**
- In `useCandidatesAnswerCoverage.ts`, after building civic results, filter out any federal candidates where `is_incumbent = false` AND a civic override exists with matching name+state.

**Profile UI:**
- In `CandidateProfile.tsx`, fetch `prior_offices` from the override and render a "Prior Positions" card if non-empty.
