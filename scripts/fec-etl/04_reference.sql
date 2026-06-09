-- Reference & summary transforms (cycle-parameterized, idempotent/upsert).
--   cm     -> public.external_pacs           (committee master)
--   cn     -> public.fec_candidates          (candidate master)
--   weball -> public.external_committee_finance (candidate $ summary)
--            + UPDATE public.finance_reconciliation / committee_finance_rollups (FEC side)
-- Requires fec_stage.cm, fec_stage.cn, fec_stage.weball loaded (full).
-- Run:  psql "$SUPABASE_DB_URL" -v cycle=2024 -f scripts/fec-etl/04_reference.sql
\set ON_ERROR_STOP on

-- money helper: parse "152304.86" / "0" / "" -> integer dollars (null-safe)
-- (inlined via case ... ~ regex below)

-- ── cm -> external_pacs ──────────────────────────────────────────────────────
insert into public.external_pacs
  (fec_committee_id, name, committee_type, designation, party, state, treasurer_name,
   street_1, city, zip, filing_frequency, organization_type, cycles, is_active, source)
select
  m.cmte_id, m.cmte_nm, nullif(m.cmte_tp,''), nullif(m.cmte_dsgn,''),
  nullif(m.cmte_pty_affiliation,''), nullif(m.cmte_st,''), nullif(m.tres_nm,''),
  nullif(m.cmte_st1,''), nullif(m.cmte_city,''), nullif(m.cmte_zip,''),
  nullif(m.cmte_filing_freq,''), nullif(m.org_tp,''),
  array[:'cycle']::text[], true, 'fec_bulk'
from fec_stage.cm m
where m.cmte_id <> ''
on conflict (fec_committee_id) do update set
  name = excluded.name, committee_type = excluded.committee_type,
  designation = excluded.designation, party = excluded.party, state = excluded.state,
  treasurer_name = excluded.treasurer_name, street_1 = excluded.street_1,
  city = excluded.city, zip = excluded.zip, filing_frequency = excluded.filing_frequency,
  organization_type = excluded.organization_type, source = 'fec_bulk',
  updated_at = now(),
  cycles = (select array_agg(distinct c) from unnest(public.external_pacs.cycles || excluded.cycles) c);

-- ── cn -> fec_candidates ─────────────────────────────────────────────────────
insert into public.fec_candidates
  (fec_candidate_id, cycle, name, party, election_year, office, office_state,
   office_district, incumbent_challenger, status, principal_committee_id,
   street_1, street_2, city, state, zip)
select
  c.cand_id, :'cycle', c.cand_name, nullif(c.cand_pty_affiliation,''),
  nullif(c.cand_election_yr,''), nullif(c.cand_office,''), nullif(c.cand_office_st,''),
  nullif(c.cand_office_district,''), nullif(c.cand_ici,''), nullif(c.cand_status,''),
  nullif(c.cand_pcc,''), nullif(c.cand_st1,''), nullif(c.cand_st2,''),
  nullif(c.cand_city,''), nullif(c.cand_st,''), nullif(c.cand_zip,'')
from fec_stage.cn c
where c.cand_id <> ''
on conflict (fec_candidate_id, cycle) do update set
  name=excluded.name, party=excluded.party, election_year=excluded.election_year,
  office=excluded.office, office_state=excluded.office_state, office_district=excluded.office_district,
  incumbent_challenger=excluded.incumbent_challenger, status=excluded.status,
  principal_committee_id=excluded.principal_committee_id, street_1=excluded.street_1,
  street_2=excluded.street_2, city=excluded.city, state=excluded.state, zip=excluded.zip,
  updated_at=now();

-- ── weball -> external_committee_finance (keyed by principal committee) ───────
insert into public.external_committee_finance
  (committee_id, committee_name, designation, candidate_id, cycle, total_raised, individual_contributions,
   pac_contributions, party_contributions, total_disbursed, last_fec_check)
select
  cn.cand_pcc,
  cm.cmte_nm,
  coalesce(nullif(cm.cmte_dsgn,''), 'U'),
  w.cand_id,
  :'cycle',
  round(nullif(w.ttl_receipts,'')::numeric)::int,
  round(nullif(w.ttl_indiv_contrib,'')::numeric)::int,
  round(nullif(w.other_pol_cmte_contrib,'')::numeric)::int,
  round(nullif(w.pol_pty_contrib,'')::numeric)::int,
  round(nullif(w.ttl_disb,'')::numeric)::int,
  now()
from fec_stage.weball w
join fec_stage.cn cn on cn.cand_id = w.cand_id and nullif(cn.cand_pcc,'') is not null
left join fec_stage.cm cm on cm.cmte_id = cn.cand_pcc
where w.ttl_receipts ~ '^-?[0-9.]+$'
on conflict (committee_id, cycle) do update set
  committee_name = excluded.committee_name, candidate_id = excluded.candidate_id,
  total_raised = excluded.total_raised, individual_contributions = excluded.individual_contributions,
  pac_contributions = excluded.pac_contributions, party_contributions = excluded.party_contributions,
  total_disbursed = excluded.total_disbursed, last_fec_check = now(), updated_at = now();

-- ── Feed app reconciliation (UPDATE existing rows only — never insert) ────────
update public.finance_reconciliation r set
  fec_total_receipts       = round(nullif(w.ttl_receipts,'')::numeric)::int,
  fec_pac_contributions    = round(nullif(w.other_pol_cmte_contrib,'')::numeric)::int,
  fec_party_contributions  = round(nullif(w.pol_pty_contrib,'')::numeric)::int,
  fec_candidate_contribution = round(nullif(w.cand_contrib,'')::numeric)::int,
  fec_loans   = round((coalesce(nullif(w.cand_loans,'')::numeric,0) + coalesce(nullif(w.other_loans,'')::numeric,0)))::int,
  fec_transfers = round(nullif(w.trans_from_auth,'')::numeric)::int,
  last_fec_check = now(), updated_at = now()
from fec_stage.weball w
where r.candidate_id = w.cand_id and r.cycle = :'cycle'
  and w.ttl_receipts ~ '^-?[0-9.]+$';

update public.committee_finance_rollups cr set
  fec_total_receipts = round(nullif(w.ttl_receipts,'')::numeric)::int,
  last_fec_check = now(), updated_at = now()
from fec_stage.weball w
join fec_stage.cn cn on cn.cand_id = w.cand_id
where cr.committee_id = cn.cand_pcc and cr.cycle = :'cycle'
  and w.ttl_receipts ~ '^-?[0-9.]+$';

select 'external_pacs' t, count(*) n from public.external_pacs
union all select 'fec_candidates', count(*) from public.fec_candidates where cycle = :'cycle'
union all select 'external_committee_finance', count(*) from public.external_committee_finance where cycle = :'cycle';
