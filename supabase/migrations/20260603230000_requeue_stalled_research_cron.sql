-- Auto-heal stalled candidate research (self-healing partial-coverage sweeper).
--
-- get-candidate-answers researches a candidate in chunks of 5 questions: it flips
-- answers_source to 'ai_generated' after the FIRST chunk and self-chains the remaining
-- chunks over HTTP. If that self-chain dies mid-way (edge wall-clock/CPU limit or a
-- transient HTTP failure), the candidate is left stranded at a partial answer count with
-- nothing retrying it -- drain-research-queue only claims fresh 'pending_research' rows,
-- and batch-populate-answers only targets never-synced candidates (last_answers_sync IS NULL).
--
-- This sweeper finds such stranded rows and flips them back to 'pending_research' so the
-- existing drain picks them up and finishes the missing questions. Answers are upserted by
-- candidate, so prior work is preserved -- a re-queued candidate resumes, it does not restart.
--
-- Bounded + low-churn by design:
--   * Only rows stalled > 2h (no new answer via last_answers_sync) are touched, so a
--     candidate whose chain is still progressing is never disturbed.
--   * research_attempts is NOT reset, so the drain's maxAttempts cap (default 3) limits a
--     candidate to a few lifetime completion passes -- no infinite retries on questions that
--     are genuinely unanswerable for that person. Once attempts hit the cap the row is left
--     at its best effort.
--   * Visible-states only (mirrors the drain's gate) so every re-queued row is actually
--     claimable; hidden-state rows would just sit in the queue forever.
--   * answer_count < 250 (missing >= 2 of the ~251 active questions) skips the near-complete
--     tail so we don't burn passes chasing one or two answers.
-- Thresholds above are intentionally simple and tunable. Runs hourly at :20, offset from the
-- drain (:00/:30) and discovery (:05).

create extension if not exists pg_cron;

do $$ begin perform cron.unschedule('requeue-stalled-research'); exception when others then null; end $$;

select cron.schedule('requeue-stalled-research', '20 * * * *', $cron$
  with stalled as (
    select c.id
    from public.candidates c
    join public.candidate_answers a on a.candidate_id = c.id
    where c.answers_source = 'ai_generated'
      and c.research_attempts < 3
      and (c.last_answers_sync is null or c.last_answers_sync < now() - interval '2 hours')
      and (
        upper(coalesce(c.state, '')) in ('', 'US')
        or upper(coalesce(c.state, '')) not in (select upper(state_code) from public.hidden_states)
      )
    group by c.id
    having count(a.id) < 250
  )
  update public.candidates
  set answers_source = 'pending_research',
      last_research_at = null
  where id in (select id from stalled);
$cron$);
