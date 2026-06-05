-- Donor-entity social card: server-side RPCs + rotation change.
--
-- The daily "top_donor" social card is moving from a CANDIDATE-anchored card
-- (facts about a politician's biggest donor) to a DONOR-ENTITY profile card that
-- mirrors the in-app /donor/:id screen and the DonorStatsCard share card.
--
-- Edge functions cannot read the `private` schema (where the donor-consolidation
-- materialized views live), so we expose exactly what the auto-poster needs via
-- two SECURITY DEFINER RPCs in `public`, matching the style of
-- get_candidate_caption_facts (see 20260604210000_caption_facts_funding.sql).
--
--   * get_top_donor_entities  — the daily PICK POOL: top donors by total $ (so the
--     featured donor is always notable), excluding recently-featured ids.
--   * get_donor_card_facts    — the verified facts behind ONE donor's card
--     (totals, top recipients, optional classified cause), keyed by primary_id.
--
-- Column sources (verified against the live DB, 2026-06-05):
--   private.donor_consolidated_all_mv : primary_id, display_name, type, total_amount,
--       total_transactions, recipient_count, is_refund   (across-cycle, consolidated)
--   private.donor_consolidated_mv     : display_name, cycle                (per-cycle)
--   public.donors                     : display_name, name, candidate_id, amount,
--       recipient_committee_name, is_contribution, is_vendor_refund
--   public.donor_aliases              : canonical_name, primary_cause_id,
--       cause_ai_reasoning, is_active
--   public.committee_causes           : id, label
--   public.donor_cause_overrides      : donor_name, donor_type, primary_cause_id

-- ---------------------------------------------------------------------------
-- Daily pick pool: top donor entities by total $ (excluding given ids).
-- ---------------------------------------------------------------------------
create or replace function public.get_top_donor_entities(
  _limit int default 100,
  _exclude_ids text[] default '{}'
)
returns table (
  primary_id text,
  display_name text,
  type text,
  total_amount bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.primary_id,
    m.display_name,
    m.type::text as type,
    m.total_amount
  from private.donor_consolidated_all_mv m
  where m.is_refund = false
    and m.primary_id is not null
    and not (m.primary_id = any(coalesce(_exclude_ids, '{}'::text[])))
  order by m.total_amount desc
  limit greatest(1, coalesce(_limit, 100));
$$;

grant execute on function public.get_top_donor_entities(int, text[])
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verified facts for one donor's card, keyed by a primary_id from the pool.
-- Mirrors the /donor/:id header + DonorStatsCard: totals, top recipients,
-- optional classified cause. Numbers come straight from the consolidated MVs
-- (never re-rounded). Cause is OPTIONAL (null when unclassified).
-- ---------------------------------------------------------------------------
create or replace function public.get_donor_card_facts(_donor_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    -- Resolve the donor by primary_id to its consolidated, across-cycle row.
    select
      m.display_name,
      m.type::text   as type,
      m.total_amount,
      m.total_transactions,
      m.recipient_count
    from private.donor_consolidated_all_mv m
    where m.primary_id = _donor_id
    limit 1
  ),
  cyc as (
    -- Distinct cycles this consolidated donor gave in (per-cycle MV rows).
    select count(*)::int as cycle_count
    from private.donor_consolidated_mv pm, target t
    where lower(pm.display_name) = lower(t.display_name)
  ),
  loc as (
    -- Best-effort location: the most common city/state on this donor's federal
    -- rows. May be null (PACs/orgs frequently have none).
    select c.contributor_city, c.contributor_state
    from (
      select d.contributor_city, d.contributor_state, count(*) as n
      from public.donors d, target t
      where lower(coalesce(d.display_name, d.name)) = lower(t.display_name)
        and d.contributor_state is not null
        and btrim(d.contributor_state) <> ''
      group by d.contributor_city, d.contributor_state
      order by n desc
      limit 1
    ) c
  ),
  recips as (
    -- Top 3 federal recipients (candidate name, else receiving committee name),
    -- summed across this donor's name variations — replicates DonorProfile's
    -- "Top Recipients" group-by recipient + sum(amount).
    select coalesce(jsonb_agg(r), '[]'::jsonb) as items
    from (
      select jsonb_build_object('name', name, 'amount', amount) as r
      from (
        select coalesce(c.name, d.recipient_committee_name, 'Unknown') as name,
               sum(d.amount)::bigint as amount
        from public.donors d
        left join public.candidates c on c.id = d.candidate_id
        , target t
        where lower(coalesce(d.display_name, d.name)) = lower(t.display_name)
          and coalesce(d.is_contribution, true)
          and coalesce(d.is_vendor_refund, false) = false
          and d.amount > 0
        group by coalesce(c.name, d.recipient_committee_name, 'Unknown')
        order by amount desc
        limit 3
      ) z
    ) y
  ),
  cause as (
    -- Optional classified cause. A direct donor_cause_overrides row wins; else
    -- the alias-level cause matched by canonical_name (case-insensitive, trimmed)
    -- to the donor's display_name. Null when neither classifies the donor.
    select jsonb_build_object('label', cc.label, 'reasoning', reasoning) as obj
    from (
      select coalesce(ovr.primary_cause_id, da.primary_cause_id) as cause_id,
             case when ovr.primary_cause_id is not null then null else da.cause_ai_reasoning end as reasoning
      from target t
      left join public.donor_cause_overrides ovr
        on lower(btrim(ovr.donor_name)) = lower(btrim(t.display_name))
       and ovr.donor_type = t.type
      left join public.donor_aliases da
        on da.is_active
       and da.primary_cause_id is not null
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
      'location',        (select case
                                   when contributor_state is null then null
                                   when contributor_city is not null and btrim(contributor_city) <> ''
                                     then contributor_city || ', ' || contributor_state
                                   else contributor_state
                                 end from loc),
      'total_given',     (select total_amount from target),
      'donation_count',  (select total_transactions from target),
      'recipient_count', (select recipient_count from target),
      'cycle_count',     (select cycle_count from cyc),
      'top_recipients',  (select items from recips),
      'cause',           (select obj from cause)
    )
  end;
$$;

grant execute on function public.get_donor_card_facts(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rotation: drop committee_spender for now (it's being rebuilt separately) so
-- the daily run only drafts rep_profile + the new donor-entity top_donor card.
-- ---------------------------------------------------------------------------
update public.social_post_settings
  set rotation_types = ARRAY['rep_profile', 'top_donor']
  where id = 1;

alter table public.social_post_settings
  alter column rotation_types set default ARRAY['rep_profile', 'top_donor'];
