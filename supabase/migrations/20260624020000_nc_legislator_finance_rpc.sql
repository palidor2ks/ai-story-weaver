-- nc_legislator_finance(p_name, p_district, p_office)
-- Campaign-finance summary for a NC state legislator, matched against ingested
-- nc_contributions. Returns the same JSONB shape as fl/nj/ny/tx_legislator_finance:
--   { matched_entities, total_raised, contribution_count, election_years, top_contributors }
--
-- Matching policy (mirrors tx_legislator_finance, adapted for NCSBE schema):
--   * Office: "N.C. Senate" → SEN, "N.C. House of Representatives" → REP.
--   * nc_contributions.candidate_full_name is "First Last" (not "Last, First").
--   * Match: ALL significant name tokens (≥2 chars, not a title/suffix) appear in
--     the candidate_full_name, unaccented on both sides for accent-insensitive matching.
--   * District is NOT a hard filter: legislators run in different districts over a career.
--     Requiring full first+last name within the NC chambers keeps collisions near-nil.
--   * Federal NC offices (U.S. Senate / U.S. House) are excluded — the FEC pipeline
--     owns those. Only NC General Assembly members (SEN/REP) are matched here.
create extension if not exists unaccent;

create or replace function public.nc_legislator_finance(
  p_name     text,
  p_district text default null,
  p_office   text default null
) returns jsonb
language sql
stable
set search_path = public
as $func$
  with n as (
    select
      ((p_office ilike '%senat%' or p_office ilike '%repres%' or p_office ilike '%house%'
          or p_office ilike '%assembl%')
        and not (p_office ilike '%u.s.%' or p_office ilike '%united states%'
                   or p_office ilike '%congress%' or p_office ilike '%federal%')
      ) as is_nc_leg,
      case
        when p_office ilike '%senat%'
          and not (p_office ilike '%u.s.%' or p_office ilike '%united states%')  then 'SEN'
        when (p_office ilike '%repres%' or p_office ilike '%house%'
                or p_office ilike '%assembl%')
          and not (p_office ilike '%u.s.%' or p_office ilike '%united states%')  then 'REP'
        else null
      end as office_code,
      array(
        select tok
        from unnest(
          string_to_array(
            regexp_replace(upper(public.unaccent(coalesce(p_name, ''))), '[^A-Z ]', ' ', 'g'),
          ' ')
        ) as tok
        where length(tok) >= 2
          and tok not in ('JR','SR','II','III','IV','MR','MRS','MS','DR','THE','HONORABLE')
      ) as toks
  ),
  matched as (
    select c.*
    from public.nc_contributions c cross join n
    where n.is_nc_leg
      and c.office_code in ('SEN', 'REP')
      and (n.office_code is null or c.office_code = n.office_code)
      and coalesce(array_length(n.toks, 1), 0) >= 2  -- need first + last (collision guard)
      and (
        select bool_and(
          upper(public.unaccent(coalesce(c.candidate_full_name, ''))) like '%' || t || '%'
        )
        from unnest(n.toks) as t
      )
  ),
  fin as (
    select
      m.account_code || '|' || coalesce(m.candidate_full_name, '') as entity_s,
      coalesce(m.candidate_full_name, m.account_code) as entity_name,
      m.party,
      m.office_code as office,
      'District ' || m.district as location,
      m.election_year,
      null::text as election_type,
      sum(m.amount)::numeric as total,
      count(*)::int as n
    from matched m
    group by m.account_code, m.candidate_full_name, m.party, m.office_code, m.district, m.election_year
  ),
  top_contributors as (
    select
      m.contributor,
      m.contributor_type,
      bool_or(coalesce(m.is_individual, false)) as is_individual,
      sum(m.amount)::numeric as total,
      count(*)::int as n,
      null::text as emp_name,
      max(m.employer) as occupation
    from matched m
    where m.contributor is not null
      and m.contributor !~* '(carry\s*?over|interest income|in-?kind|unitemized|not itemized|aggregat|lump sum)'
    group by m.contributor, m.contributor_type
    order by sum(m.amount) desc nulls last
    limit 50
  )
  select jsonb_build_object(
    'matched_entities',
      (select coalesce(jsonb_agg(to_jsonb(f) order by f.election_year desc nulls last), '[]'::jsonb)
         from fin f),
    'total_raised',
      (select coalesce(sum(total), 0) from fin),
    'contribution_count',
      (select coalesce(sum(n), 0) from fin),
    'election_years',
      (select coalesce(jsonb_agg(distinct election_year order by election_year desc), '[]'::jsonb)
         from fin where election_year is not null),
    'top_contributors',
      (select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc), '[]'::jsonb)
         from top_contributors t)
  );
$func$;

grant execute on function public.nc_legislator_finance(text, text, text) to anon, authenticated;
