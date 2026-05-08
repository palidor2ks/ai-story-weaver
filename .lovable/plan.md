# Restore Pulse Score for local officials in admin

## Problem

In the admin Answer Coverage table, several NJ local officials (Brian Wahler, Michele Lombardi, Sharon Carmichael, …) show **no Pulse Score**, while Joe Danielsen (state rep) does show one (`L3.47`).

## Root cause

`src/hooks/useCandidatesAnswerCoverage.ts` builds local/civic rows from two sources:

1. **`candidate_overrides`** — picked via an `OR` filter that only matches IDs starting with:
   `openstates_%, nj_%, ny_%, ca_%, tx_%, fl_%, pa_%`
2. **`static_officials`** — fallback for everything else.

The IDs of the missing officials are `mayor_nj_piscataway`, `local_nj_piscataway_town_council_member_…`. They do **not** match the OR prefixes (`mayor_…`, `local_…` are not listed), so they fall through to the `static_officials` branch.

In that branch (line ~660), `overall_score` is hardcoded to `null` when constructing the coverage row — even though `candidate_overrides` actually has a real score for these IDs (verified: Wahler `-4.23`, Lombardi `-4.68`, Carmichael `-5.65`).

Result: Pulse Score column is empty for those rows.

Joe Danielsen works because his ID starts with `openstates_`, matches the OR filter, and his `overall_score` is read directly.

## Fix

In `src/hooks/useCandidatesAnswerCoverage.ts`, in the `static_officials` block (around lines 626–668):

1. After fetching `staticOfficials` and computing `newIds`, also fetch matching rows from `candidate_overrides` (`candidate_id, overall_score, coverage_tier, confidence`) keyed by those same `newIds`, in parallel with the existing `candidate_answer_coverage_stats` query.
2. Build an override lookup map.
3. When constructing each static row via `makeCivicCoverage`, pass `overall_score: overrideMap[s.id]?.overall_score ?? null` instead of hardcoded `null`. Also prefer override `coverage_tier` / `confidence` when present.

No DB changes, no other call sites affected. The federal/openstates path is untouched.

## Out of scope

- Expanding the OR-prefix filter (would duplicate the same data through two paths).
- Backfilling scores for officials that genuinely have no override row.
- Any UI/styling changes — the Pulse Score column will simply populate.
