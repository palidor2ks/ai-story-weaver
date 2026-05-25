create table if not exists public.committee_aliases (
  fec_committee_id text primary key,
  alias_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_committee_aliases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_committee_aliases_updated_at on public.committee_aliases;
create trigger trg_committee_aliases_updated_at
before update on public.committee_aliases
for each row
execute function public.touch_committee_aliases_updated_at();

alter table public.committee_aliases enable row level security;

drop policy if exists "Committee aliases are viewable by everyone" on public.committee_aliases;
create policy "Committee aliases are viewable by everyone"
on public.committee_aliases
for select
using (true);

drop policy if exists "Only admins can modify committee aliases" on public.committee_aliases;
create policy "Only admins can modify committee aliases"
on public.committee_aliases
for all
using (public.has_role(auth.uid(), 'admin'::app_role))
with check (public.has_role(auth.uid(), 'admin'::app_role));
