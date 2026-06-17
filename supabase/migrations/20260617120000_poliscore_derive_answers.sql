-- Re-derive NC/NJ candidate position answers from their VERIFIED voting records (PoliScore v0).
--
-- Why: the alignment quiz's per-question answers were mostly AI-inferred or fabricated-provenance
-- (DATA-ACCURACY §Answers). For visible-state members we now have a verified vote record and an
-- owner-approved key-vote→question map, so we replace the low-trust answers (where a vote exists)
-- with vote-derived ones that carry a real Congress.gov source. Answers without a mapped vote are
-- left as-is (still demoted from scoring by isTrustedForScoring); existing values are ARCHIVED, not
-- deleted. Owner-approved scope (2026-06-17): HIGH-confidence mappings only; magnitude ±5 for a
-- single key vote, ±10 when 2+ key votes on the same question agree; Not Voting/Present → no answer.
-- Mapping rationale + open items: docs/poliscore-question-map-draft.md.

-- 1) The approved key-vote → question map (the human-reviewed curation gate). bill_type lowercase
--    to match poliscore_key_votes. Public-readable reference data (like poliscore_key_votes).
create table if not exists public.poliscore_key_vote_questions (
  id          uuid primary key default gen_random_uuid(),
  congress    integer not null,
  bill_type   text    not null,
  bill_number integer not null,
  question_id text    not null references public.questions(id),
  created_at  timestamptz not null default now(),
  unique (congress, bill_type, bill_number, question_id)
);

insert into public.poliscore_key_vote_questions (congress, bill_type, bill_number, question_id) values
  (119,'hr',2312,'economy-q15'),
  (119,'hr',2550,'economy-q16'),
  (119,'hr',5408,'economy-q16'),
  (119,'hr',1366,'environment-q16'),
  (119,'hr',4758,'environment-q7'),
  (119,'hr',2965,'government-q18'),
  (118,'hr',288,'jud-06'),
  (119,'hr',498,'civil-rights-q9'),
  (119,'hr',28,'civil-rights-q9'),
  (119,'hr',1041,'civil-rights-q21'),
  (118,'hr',26,'civil-rights-q22'),
  (118,'hr',2,'immigration-q2'),
  (118,'hr',2,'immigration-q6'),
  (119,'hr',30,'immigration-q7'),
  (119,'hr',2913,'defense-q6'),
  (119,'hr',2913,'defense-q15')
on conflict (congress, bill_type, bill_number, question_id) do nothing;

alter table public.poliscore_key_vote_questions enable row level security;
do $$ begin
  create policy "key_vote_questions public read" on public.poliscore_key_vote_questions for select using (true);
exception when duplicate_object then null; end $$;
-- the map is the human curation gate: only admins may add/change mappings (writes never via anon).
do $$ begin
  create policy "key_vote_questions admin write" on public.poliscore_key_vote_questions for all
    using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

-- 2) Archive of superseded candidate answers (audit; we never delete the prior value).
create table if not exists public.candidate_answers_history (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      text not null,
  question_id       text not null,
  answer_value      integer,
  source_type       text,
  evidence_type     text,
  source_url        text,
  source_urls       text[],
  source_description text,
  confidence        text,
  has_discrepancy   boolean,
  discrepancy_note  text,
  superseded_at     timestamptz not null default now(),
  superseded_reason text
);
alter table public.candidate_answers_history enable row level security;
do $$ begin
  create policy "answers_history admin read" on public.candidate_answers_history for select
    using (public.has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

-- 3) Compute the vote-derived answers for VISIBLE-state candidates and apply them.
-- candidate_answers carries two BEFORE-UPDATE anti-tampering triggers that block changes to
-- answer_value/confidence/evidence_type unless the writer is an admin or service_role. This is a
-- deliberate, owner-approved service data migration, so we assert the service_role claim for this
-- transaction only (set local) — the exact carve-out those triggers intend.
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_count integer;
begin
  -- materialize the derivation (validated 2026-06-17): final-passage vote per bill (max vote_number),
  -- direction = (Yea +1 / Nay -1) * (lean right +1 / left -1); per (candidate,question): single vote
  -- ±5, 2+ agreeing ±10, mixed net ±5, even split → skipped (handled by the all-agree/net rules).
  create temporary table _derived on commit drop as
  with hidden as (select upper(state_code) code from public.get_hidden_state_codes()),
  vis as (select id from public.candidates c where c.state is null or upper(c.state) not in (select code from hidden)),
  map as (
    -- start_year guards against the cross-congress bill_id collision: legacy space-format bill_ids
    -- (e.g. 'H R 26') are reused across congresses, so we constrain votes to the bill's own 2-year
    -- congress window via action_date (populated for all rows). Mirrors 20260616163000_poliscore_fixes.
    select kvq.question_id, kv.lean, kv.source_url, kv.title, kv.congress, kv.bill_type, kv.bill_number,
           b.id as bill_id, (1789 + (kvq.congress - 1) * 2) as start_year
    from public.poliscore_key_vote_questions kvq
    join public.poliscore_key_votes kv
      on kv.congress = kvq.congress and kv.bill_type = kvq.bill_type and kv.bill_number = kvq.bill_number
     and kv.score_version = 'v0'
    join public.bills b
      on b.congress = kvq.congress and lower(b.bill_type) = kvq.bill_type and b.bill_number = kvq.bill_number
  ),
  fp as (
    select m.bill_id, max(cv.vote_number) as fp_vote
    from map m join public.candidate_votes cv on cv.bill_id = m.bill_id and cv.action_type = 'floor_vote'
     and extract(year from cv.action_date) between m.start_year and m.start_year + 1
    group by m.bill_id
  ),
  votes as (
    select cv.candidate_id, m.question_id, m.lean, m.source_url,
           upper(m.bill_type)||m.bill_number||' ('||m.congress||'th)' as bill_label, cv.position,
           (case when cv.position='Yea' then 1 when cv.position='Nay' then -1 end)
             * (case when m.lean='right' then 1 else -1 end) as contrib
    from map m
    join fp on fp.bill_id = m.bill_id
    join public.candidate_votes cv
      on cv.bill_id = m.bill_id and cv.vote_number = fp.fp_vote and cv.action_type = 'floor_vote'
     and extract(year from cv.action_date) between m.start_year and m.start_year + 1
    join vis on vis.id = cv.candidate_id
    where cv.position in ('Yea','Nay')
  )
  select candidate_id, question_id,
         case when count(*)=1 then sum(contrib)*5
              when abs(sum(contrib))=count(*) then sign(sum(contrib))*10
              when sum(contrib)<>0 then sign(sum(contrib))*5
              else 0 end::int as answer_value,
         (array_agg(distinct source_url))[1] as source_url,
         array_remove(array_agg(distinct source_url), null) as source_urls,
         'Derived from final-passage roll-call vote(s): '
           || string_agg(distinct bill_label||' — '||position, '; ') as source_description,
         case when count(*) >= 2 and abs(sum(contrib))=count(*) then 'high' else 'medium' end as confidence
  from votes
  group by candidate_id, question_id
  -- skip even splits (net 0): we have no honest direction to assert. single votes are never 0
  -- (contrib is ±1), so this only drops genuine ties — they keep their prior (demoted) answer.
  having sum(contrib) <> 0;

  -- archive the rows we're about to overwrite (only those that already exist)
  insert into public.candidate_answers_history
    (candidate_id, question_id, answer_value, source_type, evidence_type, source_url, source_urls,
     source_description, confidence, has_discrepancy, discrepancy_note, superseded_reason)
  select a.candidate_id, a.question_id, a.answer_value, a.source_type, a.evidence_type, a.source_url,
         a.source_urls, a.source_description, a.confidence, a.has_discrepancy, a.discrepancy_note,
         'poliscore vote-derivation 2026-06-17'
  from public.candidate_answers a
  join _derived d on d.candidate_id = a.candidate_id and d.question_id = a.question_id;

  -- upsert the vote-derived answers (overwrite in place; (candidate_id, question_id) is unique)
  insert into public.candidate_answers
    (id, candidate_id, question_id, answer_value, source_type, evidence_type, source_url, source_urls,
     source_description, confidence, has_discrepancy, created_at, updated_at)
  select gen_random_uuid(), d.candidate_id, d.question_id, d.answer_value, 'voting_record', 'voting_record',
         d.source_url, d.source_urls, d.source_description, d.confidence, false, now(), now()
  from _derived d
  on conflict (candidate_id, question_id) do update set
    answer_value = excluded.answer_value,
    source_type = 'voting_record',
    evidence_type = 'voting_record',
    source_url = excluded.source_url,
    source_urls = excluded.source_urls,
    source_description = excluded.source_description,
    confidence = excluded.confidence,
    has_discrepancy = false,
    updated_at = now();

  select count(*) into v_count from _derived;
  raise notice 'poliscore vote-derivation: % answers derived/upserted', v_count;
end $$;
