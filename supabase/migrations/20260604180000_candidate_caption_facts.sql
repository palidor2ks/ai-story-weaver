-- Verified "headline facts" for a candidate, used by generate-social-caption to
-- build punchy, number-driven social captions without hallucinating figures.
-- Returns the latest cycle's total raised, donor count, largest direct donor, and
-- independent-expenditure totals (support/oppose) with the biggest PAC on each side.
create or replace function public.get_candidate_caption_facts(_candidate_id text, _cycle text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cyc as (
    select coalesce(
      _cycle,
      (select max(cycle) from (
        select cycle from finance_reconciliation where candidate_id = _candidate_id and cycle is not null
        union all
        select cycle from independent_expenditures where candidate_id = _candidate_id and cycle is not null
      ) z)
    ) as c
  ),
  fr as (
    select fec_total_receipts as raised
    from finance_reconciliation, cyc
    where candidate_id = _candidate_id and cycle = cyc.c
    limit 1
  ),
  td as (
    select display_name as name, sum(amount)::bigint as amount, max(type::text) as type
    from donors, cyc
    where candidate_id = _candidate_id and cycle = cyc.c
      and coalesce(is_contribution, true) and coalesce(is_vendor_refund, false) = false and amount > 0
    group by display_name
    order by sum(amount) desc
    limit 1
  ),
  ie as (
    select
      round(sum(amount) filter (where support_oppose_indicator = 'S'))::bigint as ie_support,
      round(sum(amount) filter (where support_oppose_indicator <> 'S'))::bigint as ie_oppose
    from independent_expenditures, cyc
    where candidate_id = _candidate_id and cycle = cyc.c
  ),
  sup as (
    select spending_committee_name as name, round(sum(amount))::bigint as amount
    from independent_expenditures, cyc
    where candidate_id = _candidate_id and cycle = cyc.c and support_oppose_indicator = 'S'
    group by spending_committee_name order by sum(amount) desc limit 1
  ),
  opp as (
    select spending_committee_name as name, round(sum(amount))::bigint as amount
    from independent_expenditures, cyc
    where candidate_id = _candidate_id and cycle = cyc.c and support_oppose_indicator <> 'S'
    group by spending_committee_name order by sum(amount) desc limit 1
  ),
  dc as (select donor_count from candidate_donor_counts where candidate_id = _candidate_id)
  select jsonb_build_object(
    'cycle', (select c from cyc),
    'raised', (select raised from fr),
    'donor_count', (select donor_count from dc),
    'top_donor', (select to_jsonb(td) from td),
    'ie_support', (select ie_support from ie),
    'ie_oppose', (select ie_oppose from ie),
    'top_support_pac', (select to_jsonb(sup) from sup),
    'top_oppose_pac', (select to_jsonb(opp) from opp)
  );
$$;

grant execute on function public.get_candidate_caption_facts(text, text) to anon, authenticated, service_role;
