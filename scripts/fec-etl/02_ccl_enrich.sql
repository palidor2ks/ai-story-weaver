-- ccl -> candidate_committees enrichment (matched subset, FK-safe, additive).
-- Adds candidate<->committee linkages for FEC candidates the app ALREADY tracks
-- (candidate_committees.candidate_id has a FK to candidates), expanding committee
-- coverage so more contributions get attributed. Existing rows are never clobbered.
--
-- Requires fec_stage.ccl and fec_stage.cm to be loaded (full).
-- Run:  psql "$SUPABASE_DB_URL" -v cycle=2024 -f scripts/fec-etl/02_ccl_enrich.sql

\set ON_ERROR_STOP on

insert into public.candidate_committees
  (candidate_id, fec_committee_id, name, designation, source_fec_candidate_id,
   role, active, cycles, last_cycle)
select distinct on (l.cand_id, l.cmte_id)
  l.cand_id,
  l.cmte_id,
  cm.cmte_nm,
  nullif(l.cmte_dsgn, ''),
  l.cand_id,
  case l.cmte_dsgn when 'P' then 'principal' when 'A' then 'authorized' else null end,
  true,
  array[:'cycle']::text[],
  :'cycle'
from fec_stage.ccl l
join public.candidates c on c.id = l.cand_id            -- only tracked candidates (FK-safe)
left join fec_stage.cm cm on cm.cmte_id = l.cmte_id
where l.cand_id is not null and l.cmte_id is not null
order by l.cand_id, l.cmte_id, l.fec_election_yr desc
on conflict (candidate_id, fec_committee_id) do nothing;

-- Report
select 'candidate_committees total' as metric, count(*)::text as value from public.candidate_committees
union all
select 'linkages in ccl matching a tracked candidate',
       count(distinct (l.cand_id, l.cmte_id))::text
from fec_stage.ccl l join public.candidates c on c.id = l.cand_id;
