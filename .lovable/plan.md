## Plan

Fix the NorPAC primary cause badge by making donor cause lookup tolerant of the exact alias shapes currently in the database.

### What I found
- NorPAC is correctly listed in `donor_aliases` as `canonical_name = 'NorPac'`, `primary_cause_id = 'pro-israel'`, active.
- The candidate donor row for `/candidate/B001288` is `name = 'NORPAC'`, `display_name = 'NorPac'`, `type = 'PAC'`.
- The current lookup can still miss cause display paths because it relies on case-sensitive `.in('donor_name', names)` / `.in('canonical_name', names)` filters before doing normalized comparisons in JavaScript.
- That means variants like `NORPAC`, `NOrpac`, `NorPac`, and `NOR PAC` are not consistently resolved even though they belong to the same active alias.

### Implementation
1. Update `src/hooks/useDonorCauses.ts` to normalize alias resolution before querying:
   - Build uppercase normalized input-name keys.
   - Query likely alias/member candidates using `ilike` OR filters for the input names instead of case-sensitive `.in(...)` where exact casing can fail.
   - Keep exact donor type filtering for direct overrides and member aliases.

2. Add a fallback alias-id resolution path:
   - First resolve matching `donor_alias_members` rows by normalized donor names.
   - Collect their `alias_id`s.
   - Fetch active `donor_aliases` for those alias IDs and apply any `primary_cause_id` to the original input key.
   - This specifically covers `NOR PAC` member rows whose canonical alias is `NorPac`.

3. Preserve existing precedence:
   - Direct donor overrides still win.
   - Alias-level primary cause wins before committee-topic fallback.
   - Committee-topic cause remains the final fallback.

4. Update the affected UI lookup call if needed:
   - On candidate donor rows, attempt cause lookup against `display_name`, raw `name`, and `name_variations`, not just one display value.

### Validation
- Verify NorPAC on `/candidate/B001288` resolves to `Pro-Israel` from `primary_cause_id = 'pro-israel'`.
- Verify existing donor cause badges still render for canonical names and merged donor cards.