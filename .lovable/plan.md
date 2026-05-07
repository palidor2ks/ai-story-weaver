
## Problem

Mikie Sherrill's profile page at `/candidate/nj_governor_sherrill` doesn't load because the `useCandidate` hook has a prefix allowlist for non-Congress IDs that doesn't include `nj_`. It only recognizes: `exec_`, `gov_`, `local_`, `state_`, `openstates`, `federal_`.

Since the ID `nj_governor_sherrill` doesn't match any prefix, the hook skips the override lookup path and falls through to the Congress API, which obviously can't find a state governor.

## Fix

Update the prefix check in `useCandidate` (in `src/hooks/useCandidates.ts`, ~line 249) to also include the state-prefix civic official IDs used by the civic officials system: `nj_`, `ny_`, `ca_`, `tx_`, `fl_`, `pa_`.

This is a one-line change — add the same prefixes already used in `useCandidatesAnswerCoverage.ts` line 536.
