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

-- Operating expenditures  (oppexpYY.zip -> oppexp.txt). Layout has more columns and
-- (in some FEC vintages) a header row; staged only, so we keep it loose: a single
-- raw line column. Inspect a sample before building a typed loader / target table.
drop table if exists fec_stage.oppexp_raw;
create table fec_stage.oppexp_raw ( line text );
