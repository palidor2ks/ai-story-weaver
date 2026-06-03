-- fl_legislator_finance(p_name, p_district, p_office)
-- Campaign-finance summary for a FL state legislator, matched against the
-- ingested fl_contributions. Returns the SAME jsonb shape as
-- nj_legislator_finance so the frontend rendering is shared in spirit:
--   { matched_entities, total_raised, contribution_count, election_years, top_contributors }
--
-- Matching mirrors NJ's robust approach, but FL attributes district at ingest
-- time so it can be required directly:
--   office: senat -> STS ; represent/house/assembly -> STR
--   district: fl_contributions.district = official's district (when known)
--   name:    surname (before the comma in "Last, First") appears in the
--            official's name, OR every name token appears in the candidate name
-- (handles nicknames / middle names / suffixes).

create or replace function public.fl_legislator_finance(
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
        when p_office ilike '%senat%'                                              then 'STS'
        when p_office ilike '%repres%' or p_office ilike '%house%'
          or p_office ilike '%assembl%'                                            then 'STR'
        else null
      end as office_code,
      upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g')) as name_alpha,
      array(
        select tok from unnest(string_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z ]', '', 'g')), ' ')) as tok
        where length(tok) >= 2 and tok not in ('JR', 'SR', 'II', 'III', 'IV')
      ) as toks
  ),
  matched as (
    select c.* from public.fl_contributions c cross join n
    where c.office_code in ('STR', 'STS')
      and (n.office_code is null or c.office_code = n.office_code)
      and (n.dist is null or c.district = n.dist)
      and (
        (length(regexp_replace(split_part(c.candidate_name, ',', 1), '[^A-Za-z]', '', 'g')) >= 3
          and n.name_alpha like '%' || upper(regexp_replace(split_part(c.candidate_name, ',', 1), '[^A-Za-z]', '', 'g')) || '%')
        or
        (coalesce(array_length(n.toks, 1), 0) >= 1
          and (select bool_and(upper(c.candidate_name) like '%' || t || '%') from unnest(n.toks) as t))
      )
  ),
  fin as (
    select
      min(m.election || '|' || m.candidate_name) as entity_s,
      m.candidate_name as entity_name,
      max(m.candidate_party) as party,
      m.office_code as office,
      'District ' || m.district as location,
      m.election_year,
      m.election_label as election_type,
      sum(m.amount)::numeric as total,
      count(*)::int as n
    from matched m
    group by m.candidate_name, m.office_code, m.district, m.election_year, m.election_label
  ),
  top_contributors as (
    select
      c.contributor,
      case when bool_or(coalesce(c.is_individual, false)) then 'Individual' else 'Organization' end as contributor_type,
      bool_or(coalesce(c.is_individual, false)) as is_individual,
      sum(c.amount)::numeric as total,
      count(*)::int as n,
      null::text as emp_name,
      max(c.occupation) as occupation
    from matched c
    where c.contributor is not null
      and c.contributor !~* '(carry\s*?over|interest income|in-?kind|unitemized|not itemized|aggregat|lump sum)'
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

grant execute on function public.fl_legislator_finance(text, text, text) to anon, authenticated, service_role;
