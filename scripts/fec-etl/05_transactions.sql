-- Filtered transaction transforms (cycle-parameterized; delete-then-insert per
-- cycle so a corrected re-upload cleanly refreshes that cycle).
--   oth    -> public.fec_committee_transactions
--   oppexp -> public.fec_operating_expenditures
-- Requires fec_stage.oth and fec_stage.oppexp loaded (already file-filtered).
-- Run:  psql "$SUPABASE_DB_URL" -v cycle=2024 -f scripts/fec-etl/05_transactions.sql
\set ON_ERROR_STOP on

-- ── oth -> fec_committee_transactions ────────────────────────────────────────
delete from public.fec_committee_transactions where cycle = :'cycle';
insert into public.fec_committee_transactions
  (sub_id, cycle, committee_id, amendment_ind, report_type, transaction_pgi, image_num,
   transaction_type, entity_type, name, city, state, zip, employer, occupation,
   transaction_date, amount, other_id, tran_id, file_num, memo_code, memo_text)
select distinct on (o.sub_id)
  o.sub_id, :'cycle', nullif(o.cmte_id,''), nullif(o.amndt_ind,''), nullif(o.rpt_tp,''),
  nullif(o.transaction_pgi,''), nullif(o.image_num,''), nullif(o.transaction_tp,''),
  nullif(o.entity_tp,''), nullif(o.name,''), nullif(o.city,''), nullif(o.state,''),
  nullif(o.zip_code,''), nullif(o.employer,''), nullif(o.occupation,''),
  case when o.transaction_dt ~ '^[0-9]{8}$' then to_date(o.transaction_dt,'MMDDYYYY') end,
  case when o.transaction_amt ~ '^-?[0-9]+(\.[0-9]+)?$' then round(o.transaction_amt::numeric)::int end,
  nullif(o.other_id,''), nullif(o.tran_id,''), nullif(o.file_num,''),
  nullif(o.memo_cd,''), nullif(o.memo_text,'')
from fec_stage.oth o
where o.sub_id <> ''
order by o.sub_id;

-- ── oppexp -> fec_operating_expenditures ─────────────────────────────────────
delete from public.fec_operating_expenditures where cycle = :'cycle';
insert into public.fec_operating_expenditures
  (sub_id, cycle, committee_id, amendment_ind, report_year, report_type, image_num,
   line_number, form_type, schedule_type, payee_name, city, state, zip,
   transaction_date, amount, transaction_pgi, purpose, category, category_desc,
   memo_code, memo_text, entity_type, file_num, tran_id, back_ref_tran_id)
select distinct on (e.sub_id)
  e.sub_id, :'cycle', nullif(e.cmte_id,''), nullif(e.amndt_ind,''), nullif(e.rpt_yr,''),
  nullif(e.rpt_tp,''), nullif(e.image_num,''), nullif(e.line_num,''), nullif(e.form_tp_cd,''),
  nullif(e.sched_tp_cd,''), nullif(e.name,''), nullif(e.city,''), nullif(e.state,''),
  nullif(e.zip_code,''),
  case when e.transaction_dt ~ '^[0-9]{8}$' then to_date(e.transaction_dt,'MMDDYYYY') end,
  case when e.transaction_amt ~ '^-?[0-9]+(\.[0-9]+)?$' then round(e.transaction_amt::numeric)::int end,
  nullif(e.transaction_pgi,''), nullif(e.purpose,''), nullif(e.category,''),
  nullif(e.category_desc,''), nullif(e.memo_cd,''), nullif(e.memo_text,''), nullif(e.entity_tp,''),
  nullif(e.file_num,''), nullif(e.tran_id,''), nullif(e.back_ref_tran_id,'')
from fec_stage.oppexp e
where e.sub_id <> ''
order by e.sub_id;

-- Roll operating-expense totals into the committee finance summary (additive per cycle).
update public.external_committee_finance ecf set
  operating_expenses = agg.total, updated_at = now()
from (
  select committee_id, sum(amount) as total
  from public.fec_operating_expenditures where cycle = :'cycle' group by committee_id
) agg
where ecf.committee_id = agg.committee_id and ecf.cycle = :'cycle';

select 'fec_committee_transactions' t, count(*) n from public.fec_committee_transactions where cycle = :'cycle'
union all select 'fec_operating_expenditures', count(*) from public.fec_operating_expenditures where cycle = :'cycle';
