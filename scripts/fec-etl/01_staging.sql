-- FEC bulk-data staging schema. All columns TEXT (raw load; cast in transform).
-- Column order matches the FEC bulk file layouts exactly (positional, no header).
-- Run once:  psql "$SUPABASE_DB_URL" -f scripts/fec-etl/01_staging.sql

create schema if not exists fec_stage;

-- Individual contributions  (indivYY.zip -> itcont.txt, 21 cols)
drop table if exists fec_stage.indiv;
create table fec_stage.indiv (
  cmte_id text, amndt_ind text, rpt_tp text, transaction_pgi text, image_num text,
  transaction_tp text, entity_tp text, name text, city text, state text,
  zip_code text, employer text, occupation text, transaction_dt text, transaction_amt text,
  other_id text, tran_id text, file_num text, memo_cd text, memo_text text, sub_id text
);

-- Committee -> candidate contributions  (pas2YY.zip -> itpas2.txt, 22 cols; adds cand_id)
drop table if exists fec_stage.pas2;
create table fec_stage.pas2 (
  cmte_id text, amndt_ind text, rpt_tp text, transaction_pgi text, image_num text,
  transaction_tp text, entity_tp text, name text, city text, state text,
  zip_code text, employer text, occupation text, transaction_dt text, transaction_amt text,
  other_id text, cand_id text, tran_id text, file_num text, memo_cd text, memo_text text, sub_id text
);

-- Committee -> committee transactions  (othYY.zip -> itoth.txt, 21 cols; staged only)
drop table if exists fec_stage.oth;
create table fec_stage.oth (
  cmte_id text, amndt_ind text, rpt_tp text, transaction_pgi text, image_num text,
  transaction_tp text, entity_tp text, name text, city text, state text,
  zip_code text, employer text, occupation text, transaction_dt text, transaction_amt text,
  other_id text, tran_id text, file_num text, memo_cd text, memo_text text, sub_id text
);

-- Candidate-committee linkage  (cclYY.zip -> ccl.txt, 7 cols)
drop table if exists fec_stage.ccl;
create table fec_stage.ccl (
  cand_id text, cand_election_yr text, fec_election_yr text,
  cmte_id text, cmte_tp text, cmte_dsgn text, linkage_id text
);

-- Committee master  (cmYY.zip -> cm.txt, 15 cols). Loaded full as a NAME LOOKUP
-- (no standalone target table) so transforms can resolve committee / PAC names.
drop table if exists fec_stage.cm;
create table fec_stage.cm (
  cmte_id text, cmte_nm text, tres_nm text, cmte_st1 text, cmte_st2 text,
  cmte_city text, cmte_st text, cmte_zip text, cmte_dsgn text, cmte_tp text,
  cmte_pty_affiliation text, cmte_filing_freq text, org_tp text, connected_org_nm text, cand_id text
);
create index if not exists idx_fec_stage_cm_id on fec_stage.cm (cmte_id);

-- Candidate master  (cnYY.zip -> cn.txt, 15 cols)
drop table if exists fec_stage.cn;
create table fec_stage.cn (
  cand_id text, cand_name text, cand_pty_affiliation text, cand_election_yr text,
  cand_office_st text, cand_office text, cand_office_district text, cand_ici text,
  cand_status text, cand_pcc text, cand_st1 text, cand_st2 text, cand_city text,
  cand_st text, cand_zip text
);
create index if not exists idx_fec_stage_cn_id on fec_stage.cn (cand_id);

-- Candidate financial summary  (weballYY.zip / weblYY.zip -> *.txt, 30 cols)
drop table if exists fec_stage.weball;
create table fec_stage.weball (
  cand_id text, cand_name text, cand_ici text, pty_cd text, cand_pty_affiliation text,
  ttl_receipts text, trans_from_auth text, ttl_disb text, trans_to_auth text, coh_bop text,
  coh_cop text, cand_contrib text, cand_loans text, other_loans text, cand_loan_repay text,
  other_loan_repay text, debts_owed_by text, ttl_indiv_contrib text, cand_office_st text,
  cand_office_district text, spec_election text, prim_election text, run_election text,
  gen_election text, gen_election_precent text, other_pol_cmte_contrib text, pol_pty_contrib text,
  cvg_end_dt text, indiv_refunds text, cmte_refunds text
);

-- Operating expenditures  (oppexpYY.zip -> oppexp.txt, 25 cols; header-less bulk).
drop table if exists fec_stage.oppexp;
create table fec_stage.oppexp (
  cmte_id text, amndt_ind text, rpt_yr text, rpt_tp text, image_num text, line_num text,
  form_tp_cd text, sched_tp_cd text, name text, city text, state text, zip_code text,
  transaction_dt text, transaction_amt text, transaction_pgi text, purpose text, category text,
  category_desc text, memo_cd text, memo_text text, entity_tp text, sub_id text, file_num text,
  tran_id text, back_ref_tran_id text
);
