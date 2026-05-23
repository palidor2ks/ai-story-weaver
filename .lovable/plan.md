## Why AMERICA PAC shows up

The recipient banner on `/candidate/:id` displays `donors[0].recipient_committee_name` — the top donor row by amount. For Trump (P80001571), 2024 cycle, the `donors` table contains:

| Recipient | Designation | Rows | Total |
|---|---|---|---|
| AMERICA PAC (C00879510) | U (leadership/Super PAC) | 27 | $12.28M |
| NEVER SURRENDER, INC. (C00828541) | D (delegate) | 12 | $55K |
| MAGA PAC (C00580100) | U (leadership) | 1 | $30K |

AMERICA PAC is the largest by amount, so it ends up as `donors[0]` and drives the banner label. None of Trump's authorized P/A committees (e.g. DJTRNF C00867275) have donor rows for this cycle, so the user sees a Super PAC labeled as the recipient of his "Campaign Contributions".

AMERICA PAC is Elon Musk's independent-expenditure Super PAC supporting Trump — it is **not** an authorized Trump campaign committee. It's already marked `active=false` and `role='external'` in `candidate_committees`, and donations to it should not appear in Trump's donor list at all.

Root cause: `useCandidateDonors` (and the FEC import pipelines that wrote these rows) ignore the committee's designation/active flag and accept any donor row whose `candidate_id` matches.

## Fix

1. **Frontend query (`src/hooks/useCandidates.ts` → `useCandidateDonors`)**: after loading `candidate_committees`, filter `rawDonors` to keep only rows whose `recipient_committee_id` is either (a) one of the candidate's committees with `active=true` AND designation in (`P`,`A`,`J`) — i.e. authorized campaign / JFC — or (b) absent (legacy rows). Drop rows whose recipient is a `U`/`D`/`B` committee, an inactive committee, or appears in `ie_excluded_committees`. Apply this before grouping, so banner/totals/lists all reflect the filtered set.

2. **Banner selection (`src/pages/CandidateProfile.tsx` ~L548)**: instead of `donors[0].recipient_committee_name`, prefer the candidate's primary `P`-designation committee name from `candidate_committees` (fallback to most-funded authorized committee, then to "Multiple committees" when several authorized recipients exist). This keeps the label correct even when one committee dominates by dollars.

3. **Data cleanup migration**: delete donor rows for `candidate_id='P80001571'` where `recipient_committee_id IN ('C00879510','C00828541','C00580100')` (and generalize: delete donor rows where the recipient committee is linked to the candidate with `active=false` or designation not in P/A/J). This removes the $12M of AMERICA PAC, $18M NEVER SURRENDER, etc., from his totals where they were inflating the picture.

4. **Import-side guard**: in the FEC donor import edge function(s) that populate `donors`, skip contributions whose recipient committee is not an authorized (P/A/J + active) committee of the candidate, or is in `ie_excluded_committees`. This prevents reintroduction on the next refresh.

5. **Verification**: after migration + code change, re-open Trump's profile on 2024 cycle and confirm the banner reads his authorized committee (e.g. DJTRNF) and the donor list no longer contains AMERICA PAC / NEVER SURRENDER / MAGA PAC entries. Spot-check a House/Senate incumbent to make sure normal P-only candidates are unaffected.

### Technical notes

- `candidate_committees` already has the truth: `active=false`, `role='external'` for AMERICA PAC. The filter just needs to consult it.
- Memory rule "JU BD committees excluded from main candidate totals" already exists for the finance reconciliation path — this extends the same rule to the donor list view.
- The two impacted edge functions are likely `fetch-fec-donors` and the bulk donor sync used by the admin Donor Import panel; both should share a helper that returns the allowed committee id set for a candidate.
