-- Repair: candidate_votes.bill_id ambiguity (sponsor/cosponsor rows)
-- =====================================================================
-- WHY: fetch-member-votes used to build bill_id as "TYPE.NUMBER" (no congress),
-- so every congress's HR 1234 collapsed onto one bills row, the bills upsert
-- smeared whichever congress synced last onto that row's metadata, and
-- cross-congress repeat actions were silently deduped away. Quantified
-- 2026-06-10: 50.7% of sponsorship rows had action dates impossible for their
-- bill row's labeled congress. The writer now emits canonical
-- "{congress}-{TYPE}.{NUMBER}" ids (see fetch-member-votes/index.ts); this
-- script repoints EXISTING rows.
--
-- HOW: the true congress is derived from action_date (sourced from the bill's
-- introducedDate/latestAction in the original API item, so it lies within the
-- bill's congress). Rows are repointed only when the canonical bills row
-- already exists; the rest stay on legacy ids until a member re-sync (fixed
-- writer creates canonical bills rows) makes them repairable — so RE-RUN this
-- script after re-syncs until `to_repoint` reaches 0.
--
-- Safety: idempotent + convergent. Step 2's NOT EXISTS guard skips rows whose
-- canonical twin already exists; step 4 then deletes those stranded legacy
-- duplicates. Each run only touches sponsor/cosponsor rows with legacy-format
-- ids. Run step-by-step (10 buckets exist because a single 372k-row UPDATE
-- exceeds the Supabase MCP 60s statement budget; 4 buckets/call fits).
--
-- Run record 2026-06-10: 371,917 rows repointed (0 collisions, 0 stranded);
-- post-check: 0 date-inconsistent canonical rows; 492,558 legacy rows remain
-- (296,282 date-inconsistent) awaiting canonical bills rows.

-- >>> 1. build the mapping (read-only)
drop table if exists _repair_cv_map;
create unlogged table _repair_cv_map as
with old_rows as (
  select cv.id as vote_id, cv.candidate_id, cv.action_type, cv.vote_number,
         (regexp_match(cv.bill_id, '^([A-Z]+)\.([0-9]+)$'))[1] as btype,
         (regexp_match(cv.bill_id, '^([A-Z]+)\.([0-9]+)$'))[2]::int as bnum,
         ((extract(year from cv.action_date)::int - 1789) / 2) + 1 as implied_congress
  from candidate_votes cv
  where cv.action_type in ('sponsor','cosponsor')
    and cv.bill_id ~ '^[A-Z]+\.[0-9]+$'
),
mapped as (
  select o.vote_id, o.candidate_id, o.action_type, o.vote_number,
         (o.implied_congress::text || '-' || o.btype || '.' || o.bnum::text) as new_bill_id
  from old_rows o
  where exists (select 1 from bills b
                where b.id = (o.implied_congress::text || '-' || o.btype || '.' || o.bnum::text))
)
select m.*, ntile(10) over (order by m.vote_id) as bucket
from mapped m
where not exists (
  select 1 from candidate_votes t
  where t.bill_id = m.new_bill_id and t.candidate_id = m.candidate_id
    and t.action_type = m.action_type and t.vote_number = m.vote_number
);
revoke all on _repair_cv_map from anon, authenticated;
analyze _repair_cv_map;
create index on _repair_cv_map (bucket, vote_id);
select count(*) as to_repoint from _repair_cv_map;

-- >>> 1b. VERIFY before applying: sample mappings; old/new names should be the
-- same bill (id canonicalization) or a plausible cross-congress correction.
-- select o... (see PR #352 / session notes) — eyeball ~8 rows.

-- >>> 2. apply (repeat per bucket range; ~4 buckets per call)
-- with u as (
--   update candidate_votes cv set bill_id = m.new_bill_id
--   from _repair_cv_map m where m.bucket between 1 and 4 and cv.id = m.vote_id
--   returning cv.id
-- ) select count(*) from u;

-- >>> 3. post-check: repointed rows must be congress-consistent (expect 0)
-- select count(*) from candidate_votes cv join bills b on b.id = cv.bill_id
-- where cv.bill_id ~ '^[0-9]{2,3}-[A-Z]+\.[0-9]+$'
--   and cv.action_type in ('sponsor','cosponsor')
--   and (cv.action_date::date < make_date(1787 + 2*b.congress - 1, 1, 1)
--     or cv.action_date::date > make_date(1787 + 2*b.congress + 2, 12, 31));

-- >>> 4. convergence: delete legacy rows whose canonical twin now exists
-- (no-op on first run; matters when re-running after member re-syncs)
-- with doomed as (
--   select cv.id from candidate_votes cv
--   where cv.action_type in ('sponsor','cosponsor') and cv.bill_id ~ '^[A-Z]+\.[0-9]+$'
--     and exists (
--       select 1 from candidate_votes t
--       where t.candidate_id = cv.candidate_id and t.action_type = cv.action_type
--         and t.vote_number = cv.vote_number
--         and t.bill_id = (((extract(year from cv.action_date)::int - 1789) / 2) + 1)::text
--                         || '-' || (regexp_match(cv.bill_id, '^([A-Z]+)\.'))[1]
--                         || '.' || (regexp_match(cv.bill_id, '\.([0-9]+)$'))[1]
--     )
-- ) delete from candidate_votes where id in (select id from doomed);

-- >>> 5. cleanup
-- drop table if exists _repair_cv_map;
