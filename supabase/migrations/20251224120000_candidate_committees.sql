-- Map candidates to all of their principal/authorized committees
create table if not exists public.candidate_committees (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.candidates(id) on delete cascade,
  fec_committee_id text not null,
  role text default 'authorized',
  active boolean default true,
  created_at timestamptz default now()
);

create unique index if not exists idx_candidate_committees_unique
  on public.candidate_committees(candidate_id, fec_committee_id);

create index if not exists idx_candidate_committees_committee
  on public.candidate_committees(fec_committee_id);

comment on column public.candidate_committees.role is 'principal, authorized, joint, or other';
