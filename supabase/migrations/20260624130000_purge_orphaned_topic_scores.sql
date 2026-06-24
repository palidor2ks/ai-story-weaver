-- Purge orphaned candidate_topic_scores + stop the trigger from creating new orphans.
--
-- Background (provenance trace, 2026-06-24)
-- ------------------------------------------------------------------------------------
-- candidate_topic_scores has exactly ONE writer: the trigger candidate_answers_topic_scores_sync,
-- which runs refresh_candidate_topic_scores() AFTER INSERT/UPDATE/DELETE on candidate_answers and
-- upserts each topic's score as the average of that candidate's answers. generate-legislator-answers
-- fills those answers for sub-federal candidates via Gemini, tagging each voting_record /
-- public_statement / campaign_position / **inferred** (party-norm guess, no evidence). The trusted
-- answers later get purged by the inferred-answer cleanups, but the OLD refresh function only ever
-- INSERT ... ON CONFLICT DO UPDATE -- it never DELETEs -- so when a candidate's last answer for a
-- topic is removed, the topic-score row is ORPHANED: a stale average of since-deleted answers with
-- no remaining source.
--
-- Footprint at write time: 179 candidates have topic-score rows but ZERO candidate_answers
-- (895 orphaned rows). Example: Stan Lambert (TX State Rep, tier_3) -- topic scores
-- +4.0/+3.75/-2.5/+2.0/+1.5 with no backing answers, which is what surfaced the share-card
-- "headline vs per-issue dots" mismatch. These rows violate guardrail #8 (verify data against its
-- source before surfacing it): their source no longer exists.
--
-- This migration (idempotent, all-or-nothing, applies NO cron and touches NO candidate images):
--   1. Hardens refresh_candidate_topic_scores() to DELETE a candidate's topic rows that no longer
--      have any backing answers -- so a delete-to-zero leaves no orphan. (recurrence fix)
--   2. One-time purge of the existing orphaned rows (candidates with zero answers).
--
-- NOT auto-applied (guardrail #1: apply-missing-migrations.sh is dry-run by default). Apply
-- deliberately after migration-safety-reviewer sign-off.

-- ------------------------------------------------------------------------------------
-- 1. Recurrence fix: the refresh function now also removes topics with no backing answers.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_candidate_topic_scores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  affected_candidate TEXT;
BEGIN
  affected_candidate := COALESCE(NEW.candidate_id, OLD.candidate_id);

  -- Upsert the current per-topic averages from this candidate's remaining answers.
  INSERT INTO public.candidate_topic_scores (candidate_id, topic_id, score)
  SELECT ca.candidate_id, q.topic_id, round(avg(ca.answer_value)::numeric, 2)
  FROM public.candidate_answers ca
  JOIN public.questions q ON q.id = ca.question_id
  WHERE ca.candidate_id = affected_candidate
  GROUP BY ca.candidate_id, q.topic_id
  ON CONFLICT (candidate_id, topic_id) DO UPDATE SET score = EXCLUDED.score;

  -- Remove any topic rows that no longer have a backing answer (prevents orphans on
  -- delete/update). When the candidate's last answer is removed this clears all their rows.
  DELETE FROM public.candidate_topic_scores cts
  WHERE cts.candidate_id = affected_candidate
    AND NOT EXISTS (
      SELECT 1
      FROM public.candidate_answers ca
      JOIN public.questions q ON q.id = ca.question_id
      WHERE ca.candidate_id = affected_candidate
        AND q.topic_id = cts.topic_id
    );

  RETURN NULL;
END;
$function$;

-- ------------------------------------------------------------------------------------
-- 2. One-time purge of existing orphans: topic scores for candidates with zero answers.
-- ------------------------------------------------------------------------------------
DELETE FROM public.candidate_topic_scores cts
WHERE NOT EXISTS (
  SELECT 1 FROM public.candidate_answers ca
  WHERE ca.candidate_id = cts.candidate_id
);
