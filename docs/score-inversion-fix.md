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

## Pilot results & operational findings (2026-06-20)

Regenerated all three reference candidates. Every one now has a **positive** trusted-pool score
(the harmful inversion is gone), `answers_source='ai_generated'`:

| Candidate | Before | After | Answers | trusted_avg |
| --------- | ------ | ----- | ------- | ----------- |
| Alan Branson | `L7.09` (−7.09) | `R1.62` (+1.62) | 344 | +1.62 |
| Al Barlas | `L5.00` (−5.00) | `R3.58` (+3.58) | 344 | +3.58 |
| Allen Chesser | `L4.33` (−4.33) | `R0.12` (+0.12) | 344 | +0.12 |

This validates the full chain end-to-end (stance guard + label guards + `overall_score`
re-derivation). **All three are complete (344/344) and verified positive** (`overall_score` ==
`trusted_avg` for each). Chesser was the slow one: he stalled at 300/344 through a heavy-load window
(persistent `fetch-fec-donors`/`fec-candidate-drain` 504 storms + the legacy-anon-key 401 storm) in
which several re-fires wrote zero — but the background task is idempotent (`getMissingQuestions`
resumes), so once the storm eased a later re-fire completed the final ~44 and his score settled at
+0.12. **Operational lesson:** under load, each invocation only manages ~1–5 chunks (50 q) before
its wall-clock budget cuts it off; just keep re-firing the same `candidateIds` until
`count(candidate_answers)` reaches the quiz size — progress never regresses.

> **Note on the step-2 "inversion signature" query after the fix:** it flags `sign(all_avg) <>
> sign(trusted_avg)`. Post-fix, Branson (all −0.72 / trusted +1.62) and Chesser (all −1.25 /
> trusted +0.12) still trip it — but in the *benign* direction: the **trusted pool (which is what
> scores) is positive**, while the full pool (including answers the guards stripped of trusted
> provenance) leans slightly negative. The harmful bug was the reverse (trusted *negative*). Judge
> success by "is the trusted/scoring average correct," not by raw sign-divergence.

Three things had to change in `generate-legislator-answers` to make this runbook actually work
(all on branch `claude/score-verification-rgbv2l`):

1. **`candidateIds` body param** — regenerate exactly a reviewed id list (`.in('id', …)`),
   bypassing the office/state/offset batch filter and self-chaining. Without it, scoping by
   `state` would sweep every *incomplete* candidate in NC (25) + NJ (113) and spend Gemini budget
   on all of them. Targeted spend is bounded to the listed ids.
2. **Chunked Gemini calls + per-chunk upsert** — the quiz is now **344 questions**; asking for all
   344 answers in one call overflowed `maxOutputTokens` (8192) → truncated/unparseable JSON → the
   candidate wrote **0** answers. Fix: chunk into batches of 50 (`maxOutputTokens` raised to 16384)
   and **upsert each chunk as it returns**. The background task (`EdgeRuntime.waitUntil`) has a
   bounded wall-clock budget; a single final write was lost when a multi-chunk candidate exceeded
   it. Per-chunk writes persist completed chunks, and a re-run resumes the rest via
   `getMissingQuestions` (idempotent), so repeated invocations converge.
3. **Shared cron/service auth** (`isCronAuthorized`) — lets the run be triggered server-side.

### How to trigger the regeneration (server-side, from SQL)

The container's network egress blocks `*.supabase.co` and `api.supabase.com`, and no service-role
key is reachable, so invoke via `pg_net` from the DB. **Use the new-format publishable key**
(`vault.decrypted_secrets` name `supabase_publishable_key`) for both `apikey` and `Authorization`
— the legacy anon JWT (`nj_elec_cron_anon_key`) is currently **rejected at the gateway** (a 401
storm affects many crons). `x-cron-secret` (vault `cron_secret`) authorizes inside the function.

```sql
select net.http_post(
  url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/generate-legislator-answers',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey', (select decrypted_secret from vault.decrypted_secrets where name='supabase_publishable_key'),
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='supabase_publishable_key'),
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')
  ),
  body := jsonb_build_object('candidateIds', jsonb_build_array(
    'openstates_ocd-person_525b3307-b007-4cfa-8166-efb0810fcda7',  -- Al Barlas
    'openstates_ocd-person_fc3772c1-d98a-4325-a6c8-96b9da492ed6'   -- Allen Chesser
  ))
);
```

Run one (or a few) candidates per call to stay within the background wall-clock budget; re-fire
until `count(candidate_answers)` reaches the quiz size for each id. **Caveat:** under infra load the
function's `isCronAuthorized` → `get_cron_secret()` RPC intermittently returns null and the call
401s; just retry (it succeeds on a warm/healthy instance). Verify each candidate's `overall_score`
went positive after its answers complete.

## Automated remediation — the score-sanity sweeper

Hand-regenerating the reference candidates proved the fix, but ~108 *other* visible-state
legislators were generated by the pre-guard code and still carry inverted scores (Anna Ferguson,
NC State Rep, was the first one a user spotted: `overall_score` −9.14 with a full-answer average of
−0.17 — a poisoned trusted pool). The fix is **per-candidate and not retroactive**: a candidate's
score is only corrected when their answers are regenerated. So a migration pair automates exactly
the manual loop above, as a self-terminating **detect → queue → fix** system modelled on
`requeue-stalled-research` (`20260620220000_score_sanity_sweeper.sql` = tables + functions;
`20260620220001_score_sanity_sweeper_cron.sql` = the pg_cron schedules, split out so the apply
tooling gates it under `--include-crons` per guardrail #2):

- **`score_sanity_detect()`** (cron `score-sanity-detector`, `:10,:40`) walks visible-state
  state/local legislators (federal offices excluded — same filter generate-legislator-answers uses)
  that have answers and aren't yet in `score_review_queue`, and enqueues each as `flagged` (the
  egregious inversion signature: `|trusted_avg| ≥ 5 AND |all_avg − trusted_avg| ≥ 5`) or `done`
  (looks fine). Bounded to 300/run, so it sweeps the population over a few runs then idles — that's
  the "stop once all visible-state reps have had a review" behaviour.
- **`score_sanity_fix()`** (cron `score-sanity-fixer`, `:25,:55`) drains `flagged` rows in batches of
  3. First pass: back up the candidate's answers to `candidate_answers_score_sweep_backup`, delete
  them (so `getMissingQuestions` sees them missing), fire `generate-legislator-answers` for them via
  `pg_net`. Later passes resume/finalize: once the regenerated score is no longer inverted →
  `done`; an attempt cap (3) parks a stubborn candidate as `gave_up` for human review.

**It is OFF by default.** Applying the migration starts nothing — both functions no-op unless the
kill-switch is on. Enable / monitor / pause:

```sql
-- enable
update admin_stats_cache set stat_value = '{"enabled": true}' where stat_key = 'score_sweeper_enabled';
-- monitor
select status, count(*) from score_review_queue group by status order by status;
-- pause instantly (in-flight candidates keep their progress; nothing is lost)
update admin_stats_cache set stat_value = '{"enabled": false}' where stat_key = 'score_sweeper_enabled';
```

Safety rails baked in: kill-switch (default off), backup-before-delete, bounded batch (3/run) +
30-min per-candidate cooldown (predictable Gemini spend), attempt cap (no infinite loops), and the
egregious-only threshold so correctly-scored candidates whose voting record legitimately diverges
from their full answer set (a fixed legislator at +3.5 with full-avg ~0) are **not** re-fixed. The
thresholds, batch size, cap, and cooldown are simple constants at the top of the two functions.

> **Not auto-applied.** Per the repo's migration + cron guardrails this migration is shipped for
> review and applied deliberately; it is not run from a dev session.

### Safety net

A full backup of the three candidates' **original** answers was held in
`candidate_answers_inversion_backup_20260620` (1,032 rows) while the remediation was in flight.
**All three are now complete (344/344) and verified positive, so the table was dropped
(2026-06-20).** If a future regeneration ever needs to be reverted, the backup is gone — but the run
is idempotent and the guard chain makes regenerated answers strictly more trustworthy than the
original inverted rows, so reverting to the old data is never the right move anyway.
