# Legislator score inversion — root cause & remediation runbook

**Date opened:** 2026-06-20
**Symptom:** Republican state legislators displayed with strongly *left* headline scores
(e.g. Alan Branson R, NC-59 → `L7.09`; Al Barlas R, NJ-40 → `L5.00`; Allen Chesser R, NC-25 →
`L4.33`). Decoding: `L` = negative/left on the −10…+10 scale (`src/lib/scoreFormat.ts`).

## Root cause

`candidates.overall_score` is the average of **trusted** answers only — those whose
`evidence_type='voting_record'` *or* that carry a real `source_url`
(`isTrustedForScoring`, `src/lib/scoring.ts`; mirrored in the edge functions). Two defects in
`supabase/functions/generate-legislator-answers` poisoned that trusted pool:

1. **LLM sign inversion.** Gemini intermittently returned an `answer_value` whose sign
   contradicted its *own* evidence prose. Branson's vote-derived answers all read like support
   ("co-sponsored HB 949 … commitment to school safety", "co-sponsored SB 889 to protect
   homeowners from skyrocketing property tax bills") yet were stored as **−10 / −7** (strong
   oppose), each with a real `ncleg.gov` URL and `confidence: high`. Because they were
   URL-cited, they counted as *trusted* and flipped the headline score.

2. **Self-asserted provenance.** The model picks its own `evidence_type`, so it stamped
   `voting_record` on web-research guesses even though there is no `candidate_votes` row behind
   them (`voting_record_summary` was null). The function also **bypassed the existing
   write-time label guards** (`demoteUnverifiableVoteClaims`, `demoteUncitedWebResearch`) that
   `get-candidate-answers` already applies.

The damage concentrates per-candidate: in aggregate the data is fine (Republican
`voting_record` answers average +2.77, Democrats −5.75), but when several inverted answers land
on one legislator with a small trusted pool, the whole score flips sign. ~5,765 Republican
vote-answers (~17%) and ~1,485 Democrat ones sit on the "wrong" side; some are legitimate
cross-party positions, many are inversions like Branson's.

## The code fix (this branch)

- New shared guard `dropStanceInconsistent` (`supabase/functions/_shared/answer-label-guard.ts`,
  unit-tested): the prompt now requires an explicit `stance` (`support`/`oppose`/`neutral`)
  per answer, and any answer whose stance contradicts the sign of `answer_value` is **dropped**
  before write (we can't know which side the model meant, so a self-contradictory answer is
  untrustworthy). Re-run fills it again via `getMissingQuestions`.
- `generate-legislator-answers` now also applies the existing `demoteUnverifiableVoteClaims` +
  `demoteUncitedWebResearch` guards (it previously skipped them), and **re-derives
  `overall_score` from the trusted pool after each write** (same logic as `get-candidate-answers`).
- Prompt hardened to make the `answer_value` sign follow the stated stance.

These changes only affect **newly generated / re-generated** answers. Already-persisted inverted
rows must be cleared and regenerated.

## Remediation runbook (operator — run against the live project after this PR merges)

> Requires admin auth + `GOOGLE_AI_API_KEY`; the regeneration call spends Gemini budget
> (~$0.04/candidate). Do this deliberately.

1. **Deploy the updated function.**
   `supabase functions deploy generate-legislator-answers`

2. **Identify affected candidates.** Suspect = sub-federal candidates whose trusted-answer
   average disagrees in sign with their full-answer average (the inversion signature):
   ```sql
   WITH a AS (
     SELECT c.id, c.name, c.party,
       avg(ca.answer_value) AS all_avg,
       avg(ca.answer_value) FILTER (WHERE
         ca.evidence_type='voting_record' OR ca.source_type='voting_record'
         OR (ca.source_url IS NOT NULL AND length(trim(ca.source_url))>0)
         OR (ca.source_urls IS NOT NULL AND EXISTS (
              SELECT 1 FROM unnest(ca.source_urls) u WHERE u IS NOT NULL AND length(trim(u))>0))
       ) AS trusted_avg
     FROM candidate_answers ca JOIN candidates c ON c.id=ca.candidate_id
     GROUP BY c.id, c.name, c.party
   )
   SELECT id, name, party, round(all_avg::numeric,2) all_avg, round(trusted_avg::numeric,2) trusted_avg
   FROM a
   WHERE trusted_avg IS NOT NULL AND sign(all_avg) <> sign(trusted_avg)
   ORDER BY abs(all_avg - trusted_avg) DESC;
   ```

3. **Clear the suspect answers** so the generator treats them as missing. Scope to the affected
   candidate ids from step 2 (do NOT mass-delete blindly — all-or-nothing; review the list first):
   ```sql
   DELETE FROM candidate_answers WHERE candidate_id = ANY($1);  -- $1 = reviewed id array
   ```

4. **Re-generate** (self-chaining batch; `overall_score` recomputes in-function per candidate):
   `POST /functions/v1/generate-legislator-answers` with `{ "selfChain": true }`
   (or scope with `{ "state": "NC" }`, etc.).

5. **Verify** the three reference candidates now read right-leaning and re-run the step-2 query
   to confirm the inversion set is empty:
   ```sql
   SELECT name, party, overall_score FROM candidates
   WHERE name IN ('Alan Branson','Al Barlas','Allen Chesser');
   ```

6. **Refresh the candidates cache** if the app reads from it: `refresh-candidates-cache`.
