-- ny_legislator_finance(p_name, p_district, p_office)
-- Campaign-finance summary for a NY state legislator, matched against the
-- ingested ny_filers (candidate records) / ny_contributions. Returns the SAME
-- jsonb shape as nj_/fl_legislator_finance:
--   { matched_entities, total_raised, contribution_count, election_years, top_contributors }
--
-- Matching: office (senat -> SEN ; assembly -> ASM) + district (on candidate
-- records) + name (surname, or all name tokens, appear in the candidate's
-- filer_name — letters-only on both sides so hyphens/spaces don't break it).
-- Contributions were attributed to candidate records at ingest by committee
-- name; here they're deduped by trans_number so a contribution shared across a
-- legislator's multiple candidate records (e.g. redistricting) counts once.

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
    -- letters-only on BOTH sides so punctuation/hyphens/spaces in the candidate
    -- name (e.g. "Stewart-Cousins") don't break matching.
    select f.* from public.ny_filers f cross join nn
    where f.office_code in ('SEN', 'ASM')
      and (nn.office_code is null or f.office_code = nn.office_code)
      and (nn.dist is null or f.district = nn.dist)
      and (
        (nn.surname is not null and length(nn.surname) >= 3
          and upper(regexp_replace(f.filer_name, '[^A-Za-z]', '', 'g')) like '%' || nn.surname || '%')
        or
        (coalesce(array_length(nn.toks, 1), 0) >= 1
          and (select bool_and(upper(regexp_replace(f.filer_name, '[^A-Za-z]', '', 'g')) like '%' || t || '%') from unnest(nn.toks) as t))
      )
  ),
  mc as (
    select distinct on (c.trans_number)
      c.trans_number, c.amount, c.election_year, c.election_type, c.contributor,
      c.contributor_type, c.is_individual, mf.filer_name, mf.office_code, mf.district
    from matched_filers mf join public.ny_contributions c on c.legislator_filer_id = mf.filer_id
    order by c.trans_number
  ),
  fin as (
    select
      mc.office_code || '|' || mc.district || '|' || mc.election_year as entity_s,
      max(mc.filer_name) as entity_name,
      null::text as party,
      mc.office_code as office,
      'District ' || mc.district as location,
      mc.election_year,
      max(mc.election_type) as election_type,
      sum(mc.amount)::numeric as total,
      count(*)::int as n
    from mc
    group by mc.office_code, mc.district, mc.election_year
  ),
  top_contributors as (
    select
      mc.contributor,
      case when bool_or(coalesce(mc.is_individual, false)) then 'Individual' else 'Organization' end as contributor_type,
      bool_or(coalesce(mc.is_individual, false)) as is_individual,
      sum(mc.amount)::numeric as total,
      count(*)::int as n,
      null::text as emp_name,
      null::text as occupation
    from mc
    where mc.contributor is not null
    group by mc.contributor
    order by sum(mc.amount) desc nulls last
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
