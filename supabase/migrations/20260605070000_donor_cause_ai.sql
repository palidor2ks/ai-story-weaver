-- AI-classified donor causes (third tier behind override + alias).
--
-- Only ~42% of top donors resolve to a cause via donor_cause_overrides or
-- donor_aliases.primary_cause_id, so the auto-posted "Top Donor" social card
-- often shows no cause. This adds an AI classifier (the classify-donor-cause
-- edge function) that assigns a cause to donors with none — but it ABSTAINS
-- when it can't confidently map the donor to one of the existing active causes
-- (these post publicly; a wrong label is worse than no label).
--
-- Results are CACHED here so we never re-run the AI or flip-flop a label.
-- A row with cause_id NULL means "AI tried and abstained" — still cached, so
-- the classifier no-ops on the next call.

create table if not exists public.donor_card_causes (
  primary_id    text primary key,
  cause_id      text references public.committee_causes(id),
  reasoning     text,
  assigned_by   text not null default 'ai',
  model         text,
  classified_at timestamptz not null default now()
);

-- Service role + the SECURITY DEFINER RPC (get_donor_card_facts) are the only
-- readers/writers. RLS on with NO policies denies everyone else; the definer
-- RPC and service role bypass RLS. Grant select to service_role to be safe.
alter table public.donor_card_causes enable row level security;
grant select on public.donor_card_causes to service_role;

-- ---------- get_donor_card_facts: add AI cause as a third tier ----------
-- CREATE OR REPLACE of the current version (migration 20260605060000). Only the
-- `cause` CTE changes: it now falls back to donor_card_causes when neither an
-- override nor an alias classifies the donor. Precedence: override > alias > AI.
-- Everything else (recipients, recipient_count, latest_cycle, etc.) is identical
-- to 20260605060000.
create or replace function public.get_donor_card_facts(_donor_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  with target as (
    select m.display_name, m.type::text as type, m.total_amount, m.total_transactions
    from private.donor_consolidated_all_mv m where m.primary_id = _donor_id limit 1
  ),
  cyc as (
    select count(*)::int as cycle_count, max(pm.cycle::text) as latest_cycle
    from private.donor_consolidated_mv pm, target t where pm.display_name = t.display_name
  ),
  loc as (
    select c.contributor_city, c.contributor_state from (
      select d.contributor_city, d.contributor_state, count(*) as n
      from public.donors d, target t
      where d.display_name = t.display_name and d.contributor_state is not null and btrim(d.contributor_state) <> ''
      group by d.contributor_city, d.contributor_state order by n desc limit 1
    ) c
  ),
  recip_rows as (
    -- Any positive-amount row that has a recipient (candidate OR receiving
    -- committee). We do NOT filter is_vendor_refund here: total_given already
    -- includes those rows, and the flag is over-applied (e.g. American Action
    -- Network's real gifts to Congressional Leadership Fund are flagged true), so
    -- excluding them leaves the card inconsistent ("$22M given, 0 recipients").
    -- Entity-level refund orgs are already kept out of the pool (MV is_refund).
    select coalesce(c.name, d.recipient_committee_name, 'Unknown') as rname, sum(d.amount)::bigint as amount
    from public.donors d
    left join public.candidates c on c.id = d.candidate_id
    , target t
    where d.display_name = t.display_name
      and d.amount > 0
      and (d.candidate_id is not null or btrim(coalesce(d.recipient_committee_name, '')) <> '')
    group by coalesce(c.name, d.recipient_committee_name, 'Unknown')
  ),
  recips as (
    select
      (select coalesce(jsonb_agg(jsonb_build_object('name', rname, 'amount', amount) order by amount desc), '[]'::jsonb)
         from (select rname, amount from recip_rows order by amount desc limit 3) z) as items,
      (select count(*) from recip_rows) as rc
  ),
  cause as (
    -- Cause resolution, in precedence order: override > alias > AI.
    --   1. donor_cause_overrides (manual) — reasoning null (it's a manual pick).
    --   2. donor_aliases.primary_cause_id — uses cause_ai_reasoning.
    --   3. donor_card_causes (AI, this migration) — uses dcc.reasoning. A row with
    --      cause_id null means the AI abstained, so it contributes no cause here.
    select jsonb_build_object('label', cc.label, 'reasoning', reasoning) as obj from (
      select cause_id, reasoning from (
        -- tier 1 = override/alias (override wins over alias via coalesce);
        -- tier 2 = AI. Explicit `order by tier` enforces precedence regardless of
        -- how many alias rows match, then take the single best.
        select 1 as tier,
               coalesce(ovr.primary_cause_id, da.primary_cause_id) as cause_id,
               case when ovr.primary_cause_id is not null then null else da.cause_ai_reasoning end as reasoning
        from target t
        left join public.donor_cause_overrides ovr on lower(btrim(ovr.donor_name)) = lower(btrim(t.display_name)) and ovr.donor_type = t.type
        left join public.donor_aliases da on da.is_active and da.primary_cause_id is not null and lower(btrim(da.canonical_name)) = lower(btrim(t.display_name))
        where coalesce(ovr.primary_cause_id, da.primary_cause_id) is not null
        union all
        select 2 as tier, dcc.cause_id, dcc.reasoning
        from public.donor_card_causes dcc
        where dcc.primary_id = _donor_id and dcc.cause_id is not null
      ) tiers
      order by tier
      limit 1
    ) pick join public.committee_causes cc on cc.id = pick.cause_id
  )
  select case when (select count(*) from target) = 0 then null else jsonb_build_object(
    'display_name', (select display_name from target), 'type', (select type from target),
    'location', (select case when contributor_state is null then null when contributor_city is not null and btrim(contributor_city) <> '' then contributor_city || ', ' || contributor_state else contributor_state end from loc),
    'total_given', (select total_amount from target), 'donation_count', (select total_transactions from target),
    'recipient_count', (select rc from recips), 'cycle_count', (select cycle_count from cyc),
    'latest_cycle', (select latest_cycle from cyc), 'top_recipients', (select items from recips), 'cause', (select obj from cause)
  ) end;
$$;
grant execute on function public.get_donor_card_facts(text) to anon, authenticated, service_role;
