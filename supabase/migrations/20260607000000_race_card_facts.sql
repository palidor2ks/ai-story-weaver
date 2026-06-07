-- Race-comparison social card (the manual `race_comparison` post type).
--
-- Two RPCs power a head-to-head card for one election race:
--   * get_race_options()  — distinct races (state, office, year) with 2+ candidates,
--                           used to populate the admin Settings selectors.
--   * get_race_card_facts(state, office, year, mode) — picks TWO candidates from the
--                           race and returns the verified facts behind the card:
--                           per-candidate finance (reusing get_candidate_caption_facts),
--                           top donors with their classified cause, and topic positions.
--
-- Candidate selection modes:
--   'dvr'   — leading Democrat vs leading Republican by money raised (general-election
--             head-to-head; the default).
--   'money' — the two best-funded candidates regardless of party (crowded/primary fields).
--
-- Numbers come straight from finance_reconciliation / donors / independent_expenditures
-- (never re-rounded or invented), mirroring the donor/committee card-fact RPCs.

-- ---------- race enumeration for the admin selectors ----------
create or replace function public.get_race_options()
returns table(state text, office text, year int, candidate_count int)
language sql stable security definer set search_path = public as $$
  select e.state, ec.office, extract(year from e.election_date)::int as year,
         count(distinct ec.candidate_id)::int as candidate_count
  from public.elections e
  join public.election_candidates ec on ec.election_id = e.id
  where coalesce(e.election_type,'general') = 'general'
    and e.state is not null and ec.office is not null
  group by e.state, ec.office, extract(year from e.election_date)::int
  having count(distinct ec.candidate_id) >= 2
  order by e.state, ec.office, year;
$$;
grant execute on function public.get_race_options() to anon, authenticated, service_role;

-- ---------- verified facts for one race's head-to-head card ----------
create or replace function public.get_race_card_facts(_state text, _office text, _year int, _mode text default 'dvr')
returns jsonb language sql stable security definer set search_path = public as $$
  with cyc as (select _year::text as c),
  -- distinct candidates in this race (state + office + year general), deduped
  pool as (
    select distinct on (c.id)
      c.id, c.name, c.party::text as party, c.overall_score::numeric as score,
      coalesce(ec.is_incumbent, c.is_incumbent, false) as incumbent, c.image_url
    from public.elections e
    join public.election_candidates ec on ec.election_id = e.id
    join public.candidates c on c.id = ec.candidate_id
    where e.state = _state and ec.office = _office
      and extract(year from e.election_date)::int = _year
      and coalesce(e.election_type,'general') = 'general'
  ),
  ranked as (
    select p.*, coalesce((select fr.fec_total_receipts from public.finance_reconciliation fr, cyc
                          where fr.candidate_id = p.id and fr.cycle = cyc.c limit 1), 0)::bigint as raised
    from pool p
  ),
  -- pick exactly two candidates per mode
  picks as (
    select id, raised from (
      select id, raised,
        case when _mode = 'dvr' then
          row_number() over (partition by case when party ilike 'dem%' then 'D' when party ilike 'rep%' then 'R' else 'X' end
                             order by raised desc, score asc)
        else 1 end as party_rank,
        case when party ilike 'dem%' then 'D' when party ilike 'rep%' then 'R' else 'X' end as pcode
      from ranked
    ) z
    where (_mode = 'dvr' and party_rank = 1 and pcode in ('D','R'))
       or (_mode <> 'dvr')
    order by raised desc
    limit 2
  ),
  cand_facts as (
    select
      jsonb_build_object(
        'id', r.id, 'name', r.name, 'party', r.party,
        'score', r.score, 'incumbent', r.incumbent, 'image_url', r.image_url,
        'raised', r.raised,
        'finance', public.get_candidate_caption_facts(r.id, (select c from cyc)),
        'top_donors', coalesce((
          select jsonb_agg(jsonb_build_object('name', g.name, 'amount', g.amount, 'cause', (
              select cc.label from public.committee_causes cc
              where cc.id = coalesce(
                (select ovr.primary_cause_id from public.donor_cause_overrides ovr
                   where lower(btrim(ovr.donor_name))=lower(btrim(g.name)) and ovr.donor_type=g.dtype limit 1),
                (select da.primary_cause_id from public.donor_aliases da
                   where da.is_active and da.primary_cause_id is not null
                     and lower(btrim(da.canonical_name))=lower(btrim(g.name)) limit 1)
              ) limit 1)) order by g.amount desc)
          from (
            select d.display_name as name, sum(d.amount)::bigint as amount, max(d.type::text) as dtype
            from public.donors d, cyc
            where d.candidate_id = r.id and d.cycle = cyc.c and d.amount > 0
              and coalesce(d.is_contribution, true)
              and coalesce(d.is_vendor_refund, false) = false
              and coalesce(d.is_transfer, false) = false
              and coalesce(d.is_conduit_org, false) = false
            group by d.display_name order by sum(d.amount) desc limit 3
          ) g
        ), '[]'::jsonb),
        'positions', coalesce((
          select jsonb_agg(jsonb_build_object('topic', t.name, 'score', round(s.calculated_score,1)) order by abs(s.calculated_score) desc)
          from (
            select topic_id, calculated_score from public.calculated_candidate_topic_scores
            where candidate_id = r.id and answer_count > 0 order by abs(calculated_score) desc limit 3
          ) s join public.topics t on t.id = s.topic_id
        ), '[]'::jsonb)
      ) as obj, r.raised
    from picks pr join ranked r on r.id = pr.id
  )
  select case when (select count(*) from picks) < 2 then null else jsonb_build_object(
    'state', _state, 'office', _office, 'year', _year, 'mode', _mode,
    'candidates', (select coalesce(jsonb_agg(obj order by raised desc), '[]'::jsonb) from cand_facts)
  ) end;
$$;
grant execute on function public.get_race_card_facts(text, text, int, text) to anon, authenticated, service_role;
