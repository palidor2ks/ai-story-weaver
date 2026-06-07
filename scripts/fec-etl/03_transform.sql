-- Transform filtered FEC staging -> public.contributions (+ donors aggregate),
-- for one cycle. Idempotent: existing contributions are skipped (unique
-- identity_hash,cycle), donor rows are recomputed from contributions.
--
-- Identity/donor hashing mirrors supabase/functions/import-fec-receipts-csv so
-- bulk rows dedupe against API-imported rows.
--
-- Requires: fec_stage.indiv & fec_stage.pas2 loaded (already filtered to tracked
-- committees), fec_stage.cm loaded (name lookup), and 02_ccl_enrich already run.
-- Run:  psql "$SUPABASE_DB_URL" -v cycle=2024 -f scripts/fec-etl/03_transform.sql

\set ON_ERROR_STOP on
\set sess 'fec-bulk-':cycle

-- ── 1) Individual contributions (indiv/itcont) → contributions ───────────────
insert into public.contributions
  (identity_hash, fec_transaction_id, fec_committee_transaction_id, contributor_name,
   contributor_type, amount, cycle, receipt_date, line_number, memo_code, memo_text,
   recipient_committee_id, recipient_committee_name, contributor_city, contributor_state,
   contributor_zip, employer, occupation, conduit_committee_id,
   is_contribution, is_transfer, is_earmarked, candidate_id, import_session_id)
select
  'contrib-' || left(encode(extensions.digest(i.sub_id || '|' || :'cycle', 'sha256'), 'hex'), 32),
  i.sub_id,
  nullif(i.tran_id, ''),
  i.name,
  case upper(i.entity_tp)
    when 'IND' then 'Individual' when 'ORG' then 'Organization'
    when 'COM' then 'PAC' when 'PAC' then 'PAC' when 'PTY' then 'PAC'
    when 'CCM' then 'Organization' when 'CAN' then 'Organization' else 'Unknown' end,
  round(i.transaction_amt::numeric)::int,
  :'cycle',
  case when i.transaction_dt ~ '^[0-9]{8}$' then to_date(i.transaction_dt, 'MMDDYYYY') end,
  null,
  nullif(i.memo_cd, ''), nullif(i.memo_text, ''),
  i.cmte_id, cm.cmte_nm,
  nullif(i.city, ''), nullif(i.state, ''), nullif(i.zip_code, ''),
  nullif(i.employer, ''), nullif(i.occupation, ''), nullif(i.other_id, ''),
  true, false, false,
  cc.candidate_id,
  :'sess'
from fec_stage.indiv i
left join fec_stage.cm cm on cm.cmte_id = i.cmte_id
left join lateral (
  select candidate_id from public.candidate_committees
  where fec_committee_id = i.cmte_id limit 1
) cc on true
where i.sub_id <> '' and i.name <> ''
  and i.transaction_amt ~ '^-?[0-9]+(\.[0-9]+)?$'
  and i.cmte_id in (select fec_committee_id from public.candidate_committees)
on conflict (identity_hash, cycle) do nothing;

-- ── 2) Committee→candidate contributions (pas2/itpas2) → contributions ───────
-- Contributor is the spending committee (cmte_id, name from cm); recipient is the
-- candidate's committee (other_id). Kept when the recipient committee is tracked
-- OR the candidate (cand_id) is tracked.
insert into public.contributions
  (identity_hash, fec_transaction_id, fec_committee_transaction_id, contributor_name,
   contributor_type, amount, cycle, receipt_date, line_number, memo_code, memo_text,
   recipient_committee_id, recipient_committee_name, contributor_state,
   is_contribution, is_transfer, is_earmarked, candidate_id, import_session_id)
select
  'contrib-' || left(encode(extensions.digest(p.sub_id || '|' || :'cycle', 'sha256'), 'hex'), 32),
  p.sub_id,
  nullif(p.tran_id, ''),
  coalesce(dcm.cmte_nm, nullif(p.name, ''), p.cmte_id),
  'PAC',
  round(p.transaction_amt::numeric)::int,
  :'cycle',
  case when p.transaction_dt ~ '^[0-9]{8}$' then to_date(p.transaction_dt, 'MMDDYYYY') end,
  null,
  nullif(p.memo_cd, ''), nullif(p.memo_text, ''),
  nullif(p.other_id, ''), rcm.cmte_nm,
  nullif(p.state, ''),
  true, false, false,
  coalesce(cnd.id, cc.candidate_id),
  :'sess'
from fec_stage.pas2 p
left join fec_stage.cm dcm on dcm.cmte_id = p.cmte_id     -- donor (spending) committee name
left join fec_stage.cm rcm on rcm.cmte_id = p.other_id    -- recipient committee name
left join public.candidates cnd on cnd.id = p.cand_id
left join lateral (
  select candidate_id from public.candidate_committees
  where fec_committee_id = p.other_id limit 1
) cc on true
where p.sub_id <> ''
  and p.transaction_amt ~ '^-?[0-9]+(\.[0-9]+)?$'
  and ( p.other_id in (select fec_committee_id from public.candidate_committees)
        or exists (select 1 from public.candidates x where x.id = p.cand_id) )
on conflict (identity_hash, cycle) do nothing;

-- ── 3) Rebuild donor aggregates for tracked committees, this cycle ───────────
-- Recompute from contributions (source of truth) so totals are correct and the
-- step is idempotent. Donor identity mirrors the importer's generateDonorId().
insert into public.donors
  (id, name, type, amount, cycle, transaction_count, first_receipt_date, last_receipt_date,
   contributor_city, contributor_state, contributor_zip, employer, occupation,
   recipient_committee_id, recipient_committee_name, candidate_id, is_contribution, is_transfer)
select
  d.donor_id,
  max(d.contributor_name),
  (max(d.contributor_type))::donor_type,
  sum(d.amount)::int,
  :'cycle',
  count(*)::int,
  min(d.receipt_date), max(d.receipt_date),
  max(d.contributor_city), max(d.contributor_state), max(d.contributor_zip),
  max(d.employer), max(d.occupation),
  min(d.recipient_committee_id), max(d.recipient_committee_name), min(d.candidate_id),
  true, false
from (
  select
    case when c.contributor_type = 'Individual'
      then 'fec-' || left(encode(extensions.digest(
        lower(trim(coalesce(c.contributor_name,''))) || '|' ||
        lower(trim(coalesce(c.contributor_city,''))) || '|' ||
        upper(trim(coalesce(c.contributor_state,''))) || '|' ||
        left(coalesce(c.contributor_zip,''),5) || '|' ||
        coalesce(c.recipient_committee_id,'') || '|' || c.cycle, 'sha256'),'hex'),32)
      else 'fec-' || left(encode(extensions.digest(
        lower(trim(coalesce(c.contributor_name,''))) || '|' ||
        upper(trim(coalesce(c.contributor_state,''))) || '|' ||
        coalesce(c.recipient_committee_id,'') || '|' || c.cycle, 'sha256'),'hex'),32)
    end as donor_id,
    c.contributor_name, c.contributor_type, c.amount, c.receipt_date,
    c.contributor_city, c.contributor_state, c.contributor_zip, c.employer, c.occupation,
    c.recipient_committee_id, c.recipient_committee_name, c.candidate_id
  from public.contributions c
  where c.cycle = :'cycle'
    and c.recipient_committee_id in (select fec_committee_id from public.candidate_committees)
) d
where d.donor_id is not null
group by d.donor_id
on conflict (id) do update set
  amount             = excluded.amount,
  transaction_count  = excluded.transaction_count,
  first_receipt_date = least(public.donors.first_receipt_date, excluded.first_receipt_date),
  last_receipt_date  = greatest(public.donors.last_receipt_date, excluded.last_receipt_date),
  name               = excluded.name,
  recipient_committee_name = excluded.recipient_committee_name;

-- ── Report ───────────────────────────────────────────────────────────────────
select 'contributions this cycle' as metric, count(*)::text as value
  from public.contributions where cycle = :'cycle'
union all
select 'contributions from this bulk run',
       count(*)::text from public.contributions where import_session_id = :'sess';
