-- Broaden donor records to track all receipt types distinctly
alter table public.donors
  add column if not exists receipt_type text default 'contribution',
  add column if not exists is_transfer boolean default false;

comment on column public.donors.receipt_type is 'contribution | transfer | other_receipt';
comment on column public.donors.is_transfer is 'True when receipt is a committee-to-committee transfer';
