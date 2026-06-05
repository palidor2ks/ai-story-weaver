-- Add `latest_cycle` (the most recent cycle the entity has data for) to the donor
-- and committee card facts, so the cards can show the latest cycle year while
-- keeping the all-time totals. CREATE OR REPLACE only — no behavior change beyond
-- the added field. Mirrors 20260605030000 (donor) and 20260605040000 (committee).

-- ---------- donor: add latest_cycle (max cycle across the consolidated rows) ----------
create or replace function public.get_donor_card_facts(_donor_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select m.display_name, m.type::text as type, m.total_amount,
           m.total_transactions, m.recipient_count
    from private.donor_consolidated_all_mv m
    where m.primary_id = _donor_id
    limit 1
  ),
  cyc as (
    -- exact display_name match → uses donor_consolidated_mv_display_name_idx
    select count(*)::int as cycle_count, max(pm.cycle::text) as latest_cycle
    from private.donor_consolidated_mv pm, target t
    where pm.display_name = t.display_name
  ),
  loc as (
    select c.contributor_city, c.contributor_state
    from (
      select d.contributor_city, d.contributor_state, count(*) as n
      from public.donors d, target t
      where d.display_name = t.display_name
        and d.contributor_state is not null and btrim(d.contributor_state) <> ''
      group by d.contributor_city, d.contributor_state
      order by n desc limit 1
    ) c
  ),
  recips as (
    select coalesce(jsonb_agg(r), '[]'::jsonb) as items
    from (
      select jsonb_build_object('name', name, 'amount', amount) as r
      from (
        select coalesce(c.name, d.recipient_committee_name, 'Unknown') as name,
               sum(d.amount)::bigint as amount
        from public.donors d
        left join public.candidates c on c.id = d.candidate_id
        , target t
        where d.display_name = t.display_name
          and coalesce(d.is_contribution, true)
          and coalesce(d.is_vendor_refund, false) = false
          and d.amount > 0
        group by coalesce(c.name, d.recipient_committee_name, 'Unknown')
        order by amount desc limit 3
      ) z
    ) y
  ),
  cause as (
    select jsonb_build_object('label', cc.label, 'reasoning', reasoning) as obj
    from (
      select coalesce(ovr.primary_cause_id, da.primary_cause_id) as cause_id,
             case when ovr.primary_cause_id is not null then null else da.cause_ai_reasoning end as reasoning
      from target t
      left join public.donor_cause_overrides ovr
        on lower(btrim(ovr.donor_name)) = lower(btrim(t.display_name)) and ovr.donor_type = t.type
      left join public.donor_aliases da
        on da.is_active and da.primary_cause_id is not null
       and lower(btrim(da.canonical_name)) = lower(btrim(t.display_name))
      where coalesce(ovr.primary_cause_id, da.primary_cause_id) is not null
      limit 1
    ) pick
    join public.committee_causes cc on cc.id = pick.cause_id
  )
  select case when (select count(*) from target) = 0 then null else
    jsonb_build_object(
      'display_name',    (select display_name from target),
      'type',            (select type from target),
      'location',        (select case when contributor_state is null then null
                                 when contributor_city is not null and btrim(contributor_city) <> ''
                                   then contributor_city || ', ' || contributor_state
                                 else contributor_state end from loc),
      'total_given',     (select total_amount from target),
      'donation_count',  (select total_transactions from target),
      'recipient_count', (select recipient_count from target),
      'cycle_count',     (select cycle_count from cyc),
      'latest_cycle',    (select latest_cycle from cyc),
      'top_recipients',  (select items from recips),
      'cause',           (select obj from cause)
    )
  end;
$$;
grant execute on function public.get_donor_card_facts(text) to anon, authenticated, service_role;

-- ---------- committee: add latest_cycle (max IE cycle for this spender) ----------
create or replace function public.get_committee_card_facts(_fec_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with roll as (
    select t.spending_committee_fec_id as fec_id, t.spending_committee_name as raw_name,
           t.total_amount::bigint as total_spent, t.support_amount::bigint as support_total,
           t.oppose_amount::bigint as oppose_total
    from public.committee_independent_expenditure_totals t
    where t.spending_committee_fec_id = _fec_id limit 1
  ),
  lc as (
    select max(ie.cycle::text) as latest_cycle
    from public.independent_expenditures ie
    where ie.spending_committee_fec_id = _fec_id
  ),
  targets as (
    select coalesce(jsonb_agg(r order by r_amount desc), '[]'::jsonb) as items
    from (
      select jsonb_build_object('name', tname, 'amount', amt,
               'dir', case when sup >= opp then 'support' else 'oppose' end) as r, amt as r_amount
      from (
        select coalesce(max(c.name), max(ie.target_candidate_name), 'Unknown') as tname,
          sum(ie.amount)::bigint as amt,
          sum(case when ie.support_oppose_indicator = 'S' then ie.amount else 0 end)::bigint as sup,
          sum(case when ie.support_oppose_indicator <> 'S' then ie.amount else 0 end)::bigint as opp
        from public.independent_expenditures ie
        left join public.candidates c on c.id = ie.candidate_id
        where ie.spending_committee_fec_id = _fec_id and ie.amount > 0
        group by coalesce(ie.target_fec_candidate_id, ie.candidate_id, ie.target_candidate_name)
        order by amt desc limit 3
      ) g
    ) z
  ),
  cause as (
    select jsonb_build_object('label', cc.label, 'reasoning', nullif(btrim(ct.ai_reasoning), '')) as obj
    from public.committee_topics ct
    join public.committee_causes cc on cc.id = ct.primary_cause_id
    where ct.fec_committee_id = _fec_id and ct.primary_cause_id is not null limit 1
  )
  select case when (select count(*) from roll) = 0 then null else
    jsonb_build_object('name', public.resolve_committee_name(_fec_id, (select raw_name from roll)),
      'total_spent', (select total_spent from roll), 'support_total', (select support_total from roll),
      'oppose_total', (select oppose_total from roll), 'latest_cycle', (select latest_cycle from lc),
      'top_targets', (select items from targets), 'cause', (select obj from cause))
  end;
$$;
grant execute on function public.get_committee_card_facts(text) to anon, authenticated, service_role;
