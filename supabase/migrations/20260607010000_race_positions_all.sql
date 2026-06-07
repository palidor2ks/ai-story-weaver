-- Race card: return ALL of each candidate's scored FEDERAL topic positions (not just
-- the top 3) so the comparison card can show the full primary-positions grid, and so
-- the card's AI analysis can reason over every topic. Local-scope topics are excluded
-- — race cards focus on federal races. CREATE OR REPLACE only — identical to
-- 20260607000000 except the `positions` subquery drops its LIMIT and skips local topics.
create or replace function public.get_race_card_facts(_state text, _office text, _year int, _mode text default 'dvr')
returns jsonb language sql stable security definer set search_path = public as $$
  with cyc as (select _year::text as c),
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
            where candidate_id = r.id and answer_count > 0 order by abs(calculated_score) desc
          ) s join public.topics t on t.id = s.topic_id
          where coalesce(t.scope, 'all') <> 'local'
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
