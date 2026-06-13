-- Staging table + work-claim function for the evidence-index citation matcher
-- (match-answer-citations edge function; docs/answers-enrichment-part1b-plan.md §DECIDED).
--
-- _match_stmt_citations is write-once per answer_id (upsert on conflict): a pending row
-- is inserted atomically before the distiller call, and updated in-place with the verdict.
-- The function match-answer-citations NEVER writes candidate_answers — applying staged
-- citations is a deliberate SQL command after the 50-sample precision eyeball passes
-- (plan §Ritual). Apply command: see docs/answers-enrichment-part1b-plan.md.
--
-- Replay-safe throughout (IF NOT EXISTS + drop-then-create policies).

create table if not exists public._match_stmt_citations (
  answer_id         uuid        not null primary key,  -- candidate_answers.id
  candidate_id      text        not null,
  question_id       text        not null,
  question_topic    text,                              -- questions.topic_id
  question_text     text,
  answer_value      int,
  candidate_name    text,
  state             text,
  office            text,
  statements_considered int     not null default 0,   -- topic-matched stmts retrieved
  matched_statement_id uuid,                          -- member_statements.id if cited
  matched_url       text,                             -- member_statements.url if cited
  matched_title     text,
  body_excerpt      text,                             -- excerpt sent to distiller
  supporting_quote  text,
  reason            text,
  verdict           text        not null default 'pending'
    check (verdict in ('pending', 'none', 'cited', 'error')),
  processed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_match_stmt_citations_verdict
  on public._match_stmt_citations (verdict);

create index if not exists idx_match_stmt_citations_candidate
  on public._match_stmt_citations (candidate_id);

alter table public._match_stmt_citations enable row level security;

drop policy if exists "match_stmt_citations_admin_read" on public._match_stmt_citations;
create policy "match_stmt_citations_admin_read"
  on public._match_stmt_citations for select
  to authenticated
  using (exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  ));

-- claim_answers_for_citation: returns up to p_limit unclaimed answers that have
-- topic-matched statements in the corpus. Randomised order for a diverse gate sample.
-- NOTE: no FOR UPDATE SKIP LOCKED — concurrent calls can select the same answer_ids.
-- The upsert in match-answer-citations (onConflict:'answer_id') means the last writer
-- wins, which is harmless (same distiller result expected). Add a claimed_at column if
-- production throughput requires strict once-only claiming.
create or replace function public.claim_answers_for_citation(p_limit int default 10)
returns table (
  id            uuid,
  candidate_id  text,
  question_id   text,
  answer_value  int,
  question_text text,
  topic_id      text,
  candidate_name text,
  state         text,
  office        text
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    ca.id,
    ca.candidate_id,
    ca.question_id,
    ca.answer_value,
    q.text    as question_text,
    q.topic_id,
    c.name    as candidate_name,
    c.state,
    c.office
  from candidate_answers ca
  join questions  q on q.id = ca.question_id
  join candidates c on c.id = ca.candidate_id
  where ca.source_type = 'public_statement'
    and ca.source_url   is null
    and q.topic_id      is not null
    -- sitting member: has at least one topic-matched statement in the corpus
    and exists (
      select 1 from member_statements ms
      where ms.candidate_id = ca.candidate_id
        and q.topic_id = any(ms.topic_tags)
        and ms.body_chars > 200
    )
    -- not yet staged
    and not exists (
      select 1 from _match_stmt_citations mc
      where mc.answer_id = ca.id
    )
  order by random()  -- randomise for a diverse 50-sample precision gate
  limit greatest(p_limit, 0)
$$;

revoke all on function public.claim_answers_for_citation(int) from public, anon, authenticated;
grant execute on function public.claim_answers_for_citation(int) to service_role;
