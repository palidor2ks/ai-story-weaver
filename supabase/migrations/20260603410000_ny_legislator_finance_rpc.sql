-- ny_legislator_finance(p_name, p_district, p_office)
-- Campaign-finance summary for a NY state legislator, matched against the
-- ingested ny_filers / ny_contributions. Returns the SAME jsonb shape as
-- nj_/fl_legislator_finance so the frontend rendering is consistent:
--   { matched_entities, total_raised, contribution_count, election_years, top_contributors }
--
-- Matching: office (senat -> SEN ; assembly -> ASM) + district (NY filers carry
-- a district) + name (the official's surname appears in the committee/filer
-- name, OR every name token appears in it) — handles "Friends of First Last",
-- "Last for Senate", nicknames, etc.

create or replace function public.ny_legislator_finance(
  p_name text,
  p_district text default null,
  p_office text default null
)
returns jsonb
language sql
stable
as $function$
  with n as (
    select
      nullif(regexp_replace(coalesce(p_district, ''), '\D', '', 'g'), '')::int as dist,
      case
        when p_office ilike '%senat%'   then 'SEN'
        when p_office ilike '%assembl%' then 'ASM'
        else null
      end as office_code,
      array(
        select tok from unnest(string_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z ]', '', 'g')), ' ')) as tok
        where length(tok) >= 2 and tok not in ('JR', 'SR', 'II', 'III', 'IV')
      ) as toks
  ),
  nn as (
    select *, toks[array_length(toks, 1)] as surname from n
  ),
  matched_filers as (
    select f.* from public.ny_filers f cross join nn
    where f.office_code in ('SEN', 'ASM')
      and (nn.office_code is null or f.office_code = nn.office_code)
      and (nn.dist is null or f.district = nn.dist)
      and (
        (nn.surname is not null and length(nn.surname) >= 3
          and upper(f.filer_name) like '%' || nn.surname || '%')
        or
        (coalesce(array_length(nn.toks, 1), 0) >= 1
          and (select bool_and(upper(f.filer_name) like '%' || t || '%') from unnest(nn.toks) as t))
      )
  ),
  fin as (
    select
      min(c.election_year::text || '|' || mf.filer_id) as entity_s,
      mf.filer_name as entity_name,
      null::text as party,
      mf.office_code as office,
      'District ' || mf.district as location,
      c.election_year,
      max(c.election_type) as election_type,
      sum(c.amount)::numeric as total,
      count(*)::int as n
    from matched_filers mf
    join public.ny_contributions c on c.filer_id = mf.filer_id
    group by mf.filer_name, mf.office_code, mf.district, c.election_year
  ),
  top_contributors as (
    select
      c.contributor,
      case when bool_or(coalesce(c.is_individual, false)) then 'Individual' else 'Organization' end as contributor_type,
      bool_or(coalesce(c.is_individual, false)) as is_individual,
      sum(c.amount)::numeric as total,
      count(*)::int as n,
      null::text as emp_name,
      null::text as occupation
    from matched_filers mf
    join public.ny_contributions c on c.filer_id = mf.filer_id
    where c.contributor is not null
    group by c.contributor
    order by sum(c.amount) desc nulls last
    limit 50
  )
  select jsonb_build_object(
    'matched_entities',   (select coalesce(jsonb_agg(to_jsonb(f) order by f.election_year desc), '[]'::jsonb) from fin f),
    'total_raised',       (select coalesce(sum(total), 0) from fin),
    'contribution_count', (select coalesce(sum(n), 0) from fin),
    'election_years',     (select coalesce(jsonb_agg(distinct election_year order by election_year desc), '[]'::jsonb) from fin),
    'top_contributors',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc), '[]'::jsonb) from top_contributors t)
  );
$function$;

grant execute on function public.ny_legislator_finance(text, text, text) to anon, authenticated, service_role;
