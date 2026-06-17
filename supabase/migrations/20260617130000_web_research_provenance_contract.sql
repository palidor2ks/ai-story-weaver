-- Provenance work #1 + #2: stop labeling uncited answers as `web_research`, and enforce it.
--
-- Background: the AI generator maps `organization_scorecard`/`mixed` (and any unmapped) evidence
-- to source_type='web_research', but when the research call returns no usable citation the row was
-- still saved as 'web_research' with a null source_url — a provenance badge with nothing behind it
-- (integrity finding #3). These answers are already excluded from SCORING (isTrustedForScoring),
-- but they were still DISPLAYED with a "web research" label implying a source that doesn't exist.
--
-- (1) Relabel existing VISIBLE-state web_research rows that carry no real URL to inferred/other.
--     The answer value is kept; only the dishonest label is corrected (no data deleted).
-- (2) Add a CHECK contract so no code path can write `web_research` without a citation again.
--     The matching write-time guard is supabase/functions/_shared/answer-label-guard.ts
--     (demoteUncitedWebResearch), wired into get-candidate-answers' saveAnswersBatch.
--
-- Scope: VISIBLE states only (two-state focus). The constraint is added NOT VALID so it enforces
-- every future insert/update without forcing a relabel of the frozen hidden-state backlog
-- (~17k uncited web_research rows that are ingestion-gated and out of scope).

-- candidate_answers has BEFORE-UPDATE anti-tampering triggers (admin/service_role only) covering
-- source_type/evidence_type; this is an owner-approved service relabel, so assert the service_role
-- claim for this transaction — the carve-out those triggers intend.
set local request.jwt.claim.role = 'service_role';

do $$
declare v_count integer;
begin
  with hidden as (select upper(state_code) code from public.get_hidden_state_codes()),
  vis as (
    select id from public.candidates c
    where c.state is not null and upper(c.state) not in (select code from hidden)
  )
  update public.candidate_answers ca
     set source_type = 'other', evidence_type = 'inferred', updated_at = now()
   where ca.candidate_id in (select id from vis)
     and ca.source_type = 'web_research'
     and nullif(btrim(ca.source_url), '') is null
     and not exists (
       select 1 from unnest(coalesce(ca.source_urls, '{}')) u where nullif(btrim(u), '') is not null
     );
  get diagnostics v_count = row_count;
  raise notice 'relabeled % uncited web_research answers (visible states) -> inferred/other', v_count;
end $$;

-- The contract: a `web_research` row must carry at least one real citation.
alter table public.candidate_answers
  add constraint chk_web_research_has_url
  check (
    source_type <> 'web_research'
    or nullif(btrim(source_url), '') is not null
    or coalesce(array_length(source_urls, 1), 0) > 0
  ) not valid;
