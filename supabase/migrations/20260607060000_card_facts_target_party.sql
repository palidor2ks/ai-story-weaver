-- Card facts refinement: committee targets gain `party`.
--
-- The Top PAC outside-spender card lists WHO the money targeted; add each target
-- candidate's party so the card can show a (D)/(R)/(I) tag next to the name —
-- exactly mirroring how the rest of the app labels candidates. Source: the target
-- candidate's record (matched by FEC candidate id first, then internal candidate
-- id). CREATE OR REPLACE only; mirrors 20260605060000.

create or replace function public.get_committee_card_facts(_fec_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  with roll as (
    select t.spending_committee_fec_id as fec_id, t.spending_committee_name as raw_name,
           t.total_amount::bigint as total_spent, t.support_amount::bigint as support_total, t.oppose_amount::bigint as oppose_total
    from public.committee_independent_expenditure_totals t where t.spending_committee_fec_id = _fec_id limit 1
  ),
  lc as (select max(ie.cycle::text) as latest_cycle from public.independent_expenditures ie where ie.spending_committee_fec_id = _fec_id),
  targets as (
    select coalesce(jsonb_agg(r order by r_amount desc), '[]'::jsonb) as items from (
      select jsonb_build_object(
               'name', tname, 'amount', amt,
               'dir', case when sup >= opp then 'support' else 'oppose' end,
               'office', off_label, 'state', st, 'district', dist, 'party', pty
             ) as r, amt as r_amount
      from (
        select
          coalesce(max(cf.name), max(c.name), max(ie.target_candidate_name)) as tname,
          -- party: prefer the FEC-matched candidate, else the internal candidate.
          coalesce(max(cf.party), max(c.party)) as pty,
          -- office: prefer the IE row's FEC office code (the race targeted), mapped
          -- to a label; else the target candidate's office string.
          coalesce(
            case max(nullif(ie.office, '')) when 'H' then 'U.S. House' when 'S' then 'U.S. Senate' when 'P' then 'President' else max(nullif(ie.office, '')) end,
            max(coalesce(cf.office, c.office))
          ) as off_label,
          coalesce(max(nullif(ie.state, '')), max(coalesce(cf.state, c.state))) as st,
          nullif(nullif(coalesce(max(nullif(ie.district, '')), max(coalesce(cf.district, c.district))), '00'), '0') as dist,
          sum(ie.amount)::bigint as amt,
          sum(case when ie.support_oppose_indicator = 'S' then ie.amount else 0 end)::bigint as sup,
          sum(case when ie.support_oppose_indicator <> 'S' then ie.amount else 0 end)::bigint as opp
        from public.independent_expenditures ie
        left join public.candidates c on c.id = ie.candidate_id
        left join public.candidates cf on cf.fec_candidate_id = ie.target_fec_candidate_id
        where ie.spending_committee_fec_id = _fec_id and ie.amount > 0
        group by coalesce(ie.target_fec_candidate_id, ie.candidate_id, ie.target_candidate_name)
        order by amt desc limit 3
      ) g
    ) z
  ),
  cause as (
    select jsonb_build_object('label', cc.label, 'reasoning', nullif(btrim(ct.ai_reasoning), '')) as obj
    from public.committee_topics ct join public.committee_causes cc on cc.id = ct.primary_cause_id
    where ct.fec_committee_id = _fec_id and ct.primary_cause_id is not null limit 1
  )
  select case when (select count(*) from roll) = 0 then null else jsonb_build_object(
    'name', public.resolve_committee_name(_fec_id, (select raw_name from roll)), 'total_spent', (select total_spent from roll),
    'support_total', (select support_total from roll), 'oppose_total', (select oppose_total from roll),
    'latest_cycle', (select latest_cycle from lc), 'top_targets', (select items from targets), 'cause', (select obj from cause)
  ) end;
$$;
grant execute on function public.get_committee_card_facts(text) to anon, authenticated, service_role;
