-- Polish: exclude ELEC "summary" line-items from the top-contributors list.
-- ELEC filings include non-donor rows (small-contribution aggregates, interest income,
-- carryover, lump sums) that aren't real named contributors. Filter them out of the
-- contributor list by name pattern. NOTE: we intentionally do NOT key off
-- contributor_type ('NOT PROVIDED' includes legit PACs), and we avoid bare
-- 'aggregate' (real orgs like "NJ Concrete and Aggregate Assoc"). Totals are left
-- untouched (faithful to ELEC receipts).

create or replace function public.nj_legislator_finance(
  p_name text, p_district text default null, p_office text default null
) returns jsonb language sql stable as $func$
  with n as (
    select
      nullif(regexp_replace(coalesce(p_district, ''), '\D', '', 'g'), '') as dist,
      case
        when p_office ilike '%senat%'   then '1'
        when p_office ilike '%assembl%' then '2'
        else null
      end as office_code,
      array(
        select tok from unnest(string_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z ]', '', 'g')), ' ')) as tok
        where length(tok) >= 2 and tok not in ('JR', 'SR', 'II', 'III', 'IV')
      ) as toks
  ),
  matched as (
    select e.* from public.nj_elec_entities e cross join n
    where e.office_code in ('1', '2')
      and (n.office_code is null or e.office_code = n.office_code)
      and (n.dist is null or e.location_code = n.dist)
      and coalesce(array_length(n.toks, 1), 0) >= 1
      and (select bool_and(upper(e.entity_name) like '%' || t || '%') from unnest(n.toks) as t)
  ),
  fin as (
    select m.entity_s, m.entity_name, m.party, m.office, m.location, m.election_year, m.election_type,
           coalesce(sum(c.cont_amt), 0)::numeric as total, count(c.contrib_s)::int as n
    from matched m left join public.nj_elec_contributions c on c.entity_s = m.entity_s
    group by m.entity_s, m.entity_name, m.party, m.office, m.location, m.election_year, m.election_type
  ),
  top_contributors as (
    select c.contributor, c.contributor_type, bool_or(coalesce(c.is_individual, false)) as is_individual,
           sum(c.cont_amt)::numeric as total, count(*)::int as n, max(c.emp_name) as emp_name, max(c.occupation_name) as occupation
    from matched m join public.nj_elec_contributions c on c.entity_s = m.entity_s
    where c.contributor is not null
      and c.contributor !~* '(less th[ae]n|under\s*\$?\s*[0-9]|[0-9]+\s*(and|&)\s*under|interest income|carry\s*?over|lump sum|unitemized|not itemized|threso?ld)'
    group by c.contributor, c.contributor_type
    order by sum(c.cont_amt) desc nulls last limit 50
  )
  select jsonb_build_object(
    'matched_entities',   (select coalesce(jsonb_agg(to_jsonb(f) order by f.election_year desc, f.election_type), '[]'::jsonb) from fin f),
    'total_raised',       (select coalesce(sum(total), 0) from fin),
    'contribution_count', (select coalesce(sum(n), 0) from fin),
    'election_years',     (select coalesce(jsonb_agg(distinct election_year order by election_year desc), '[]'::jsonb) from fin),
    'top_contributors',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc), '[]'::jsonb) from top_contributors t)
  );
$func$;
