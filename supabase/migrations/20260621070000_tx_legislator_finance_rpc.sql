-- Match a Texas state legislator (civic-officials / OpenStates flow: "First Last"
-- + district + chamber) to their TEC filer account(s) and return a campaign-finance
-- summary + top contributors. Centralized server-side so the frontend gets a clean
-- API instead of fuzzy "Last, First" matching in the client. Mirrors
-- nj_legislator_finance, adapted to the TEC schema and verified against loaded data.
--
-- Matching policy (source-verified 2026-06-21 against tx_cf_filers; see misses below):
--   * Chamber lives in filers.office_cd: 'STATEREP' = TX House, 'STATESEN' = TX Senate.
--   * filer_name is "Last, First Middle (Title)". Match on ALL significant name tokens
--     (first + last), unaccented on BOTH sides — TEC stores "Gamez", our data "Gámez".
--   * District/chamber are NOT hard filters: legislators switch chambers and districts
--     over a career and TEC keeps the OLD registration (e.g. Sen. Charles Perry's
--     account is still STATEREP/83; Erin Gámez STATEREP/38). Requiring full first+last
--     name tokens within the legislative chambers makes same-name collisions near-nil,
--     so name+chamber is the safe key and catches switchers that district would miss.
--   * Federal offices ("U.S. Senator" etc.) also contain 'senat' — excluded so the FEC
--     pipeline owns them (only match when the candidate is a TX state legislator).
--   * Financials sum ONLY regular reports (source_file like 'contribs_%'); special-
--     session / pre-election files (cont_ss/cont_t) are re-reported on the next regular
--     report, so including them would double-count (TEC ReadMe).
--   * Known unmatched (acceptable; section hides when total<=0): filers TEC coded as
--     office_cd 'OTHER' (e.g. Speaker Tom Craddick) — refine later if needed.
create extension if not exists unaccent;

create or replace function public.tx_legislator_finance(
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
      ((p_office ilike '%senat%' or p_office ilike '%repres%' or p_office ilike '%house%')
        and not (p_office ilike '%u.s.%' or p_office ilike '%united states%' or p_office ilike '%congress%')
      ) as is_state_leg,
      array(
        select tok
        from unnest(string_to_array(regexp_replace(upper(public.unaccent(coalesce(p_name, ''))), '[^A-Z ]', ' ', 'g'), ' ')) as tok
        where length(tok) >= 2 and tok not in ('JR','SR','II','III','IV','MR','MRS','MS','DR','THE','HONORABLE')
      ) as toks
  ),
  matched as (
    select f.*
    from public.tx_cf_filers f cross join n
    where n.is_state_leg
      and f.office_cd in ('STATEREP', 'STATESEN')
      and coalesce(array_length(n.toks, 1), 0) >= 2  -- need first + last (collision guard)
      and (select bool_and(upper(public.unaccent(f.filer_name)) like '%' || t || '%') from unnest(n.toks) as t)
  ),
  contribs as (
    select c.*
    from matched m
    join public.tx_cf_contributions c
      on c.filer_ident = m.filer_ident and c.source_file like 'contribs_%'
  ),
  fin as (
    select m.filer_ident, m.filer_name, m.office_cd, m.office_district,
           coalesce(sum(c.contribution_amount), 0)::numeric as total,
           count(c.contribution_info_id)::int as n
    from matched m
    left join contribs c on c.filer_ident = m.filer_ident
    group by m.filer_ident, m.filer_name, m.office_cd, m.office_district
  ),
  top_contributors as (
    select coalesce(nullif(contributor_name_organization, ''), contributor_name_last) as contributor,
           contributor_persent_type_cd as contributor_type,
           sum(contribution_amount)::numeric as total,
           count(*)::int as n
    from contribs
    where coalesce(nullif(contributor_name_organization, ''), contributor_name_last) is not null
    group by 1, 2
    order by sum(contribution_amount) desc nulls last
    limit 50
  )
  select jsonb_build_object(
    'matched_entities',   (select coalesce(jsonb_agg(to_jsonb(f) order by f.total desc), '[]'::jsonb) from fin f),
    'total_raised',       (select coalesce(sum(total), 0) from fin),
    'contribution_count', (select coalesce(sum(n), 0) from fin),
    'election_years',     (select coalesce(jsonb_agg(distinct yr order by yr desc), '[]'::jsonb)
                             from (select distinct extract(year from contribution_dt)::int as yr
                                     from contribs where contribution_dt is not null) z),
    'top_contributors',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc), '[]'::jsonb) from top_contributors t)
  );
$func$;

grant execute on function public.tx_legislator_finance(text, text, text) to anon, authenticated;
