-- Robust legislator↔ELEC matching.
-- Officials come from OpenStates with common first names ("Joe Vitale") while ELEC
-- stores legal names ("VITALE, JOSEPH F"), so requiring all name tokens missed anyone
-- with a nickname (Joe/Joseph, Bob/Robert) or compound surname (Van Drew). Match instead
-- on district + chamber + the ELEC surname (text before the comma) appearing in the
-- official's name, comparing letters-only so apostrophes/hyphens/spaces don't matter.
-- Falls back to all-tokens when no district is supplied. (Also keeps the summary-row
-- filter on the contributor list from the prior migration.)

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
      upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g')) as name_alpha,
      array(
        select tok from unnest(string_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z ]', '', 'g')), ' ')) as tok
        where length(tok) >= 2 and tok not in ('JR', 'SR', 'II', 'III', 'IV')
      ) as toks
  ),
  matched as (
    select e.* from public.nj_elec_entities e cross join n
    where e.office_code in ('1', '2')
      and (n.office_code is null or e.office_code = n.office_code)
      and (
        -- Primary: district + ELEC surname (before the comma) contained in the official's name.
        (n.dist is not null and e.location_code = n.dist
          and length(regexp_replace(split_part(e.entity_name, ',', 1), '[^A-Za-z]', '', 'g')) >= 3
          and n.name_alpha like '%' || upper(regexp_replace(split_part(e.entity_name, ',', 1), '[^A-Za-z]', '', 'g')) || '%')
        or
        -- Fallback: every official name token appears in the ELEC name.
        (coalesce(array_length(n.toks, 1), 0) >= 1
          and (n.dist is null or e.location_code = n.dist)
          and (select bool_and(upper(e.entity_name) like '%' || t || '%') from unnest(n.toks) as t))
      )
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
