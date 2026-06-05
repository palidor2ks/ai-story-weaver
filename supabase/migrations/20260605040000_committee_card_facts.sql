-- Committee/PAC OUTSIDE-SPENDER social card: server-side RPCs + rotation change.
--
-- The daily "committee_spender" social card is moving from a CANDIDATE-anchored
-- card (facts about a politician's biggest outside spender) to a standalone
-- OUTSIDE-SPENDER (Super PAC) profile card that mirrors the in-app /committee/:id
-- screen — exactly parallel to the donor-entity "top_donor" card (see
-- 20260605020000_donor_card_facts.sql / 20260605030000_donor_card_facts_perf.sql).
--
-- Edge functions cannot read the `private` schema, so the auto-poster gets exactly
-- what it needs via two SECURITY DEFINER RPCs in `public`:
--
--   * get_top_committee_spenders — the daily PICK POOL: top outside spenders by
--     total independent-expenditure $ (so the featured PAC is always notable),
--     excluding recently-featured fec ids and committees excluded from public IE
--     rollups.
--   * get_committee_card_facts  — the verified facts behind ONE committee's card
--     (total IE $, support/oppose split, top targets, optional classified cause),
--     keyed by fec_committee_id.
--
-- Column sources (verified against the live DB, 2026-06-05):
--   public.committee_independent_expenditure_totals : spending_committee_fec_id,
--       spending_committee_name, expenditure_count, total_amount, support_amount,
--       oppose_amount  (pre-aggregated, already-cleaned IE rollup; this is the
--       same source /top-spenders ranks on, so the junk multi-billion-dollar rows
--       in raw independent_expenditures are NOT in this pool)
--   public.independent_expenditures : spending_committee_fec_id (indexed via
--       idx_ie_spending_committee_fec_id), amount, support_oppose_indicator ('S'),
--       target_fec_candidate_id, candidate_id, target_candidate_name
--   public.candidates             : id (text), name
--   public.external_pacs          : fec_committee_id, name        (clean-name #1)
--   public.committee_aliases      : canonical_name, fec_committee_ids[], is_active (#2)
--   public.candidate_committees   : fec_committee_id, name        (clean-name #3)
--   public.committee_topics       : fec_committee_id, primary_cause_id, ai_reasoning
--   public.committee_causes       : id (text), label
--   public.ie_excluded_committees_public : fec_committee_id (skip from pool)

-- ---------------------------------------------------------------------------
-- Clean committee name. `independent_expenditures.spending_committee_name` can be
-- junk/purpose text (the "IP Protections" bug), so resolve a clean display name
-- by fec_committee_id: external_pacs.name FIRST, then the canonical_name of an
-- active committee_aliases row, then candidate_committees.name, then fall back to
-- the rollup's spending_committee_name. Marked stable so it inlines into the RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_committee_name(_fec_id text, _fallback text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ep.name from public.external_pacs ep
       where ep.fec_committee_id = _fec_id and ep.name is not null and btrim(ep.name) <> '' limit 1),
    (select ca.canonical_name from public.committee_aliases ca
       where ca.is_active and _fec_id = any(ca.fec_committee_ids)
         and ca.canonical_name is not null and btrim(ca.canonical_name) <> '' limit 1),
    (select cc.name from public.candidate_committees cc
       where cc.fec_committee_id = _fec_id and cc.name is not null and btrim(cc.name) <> '' limit 1),
    nullif(btrim(_fallback), ''),
    _fec_id
  );
$$;

grant execute on function public.resolve_committee_name(text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Daily pick pool: top outside-spender committees by total IE $ (excluding given
-- fec ids). Sourced from committee_independent_expenditure_totals — the same view
-- /top-spenders ranks on, which ALREADY drops committees in the public IE-exclusion
-- list (via ie_excluded_committee_ids()), so the junk multi-billion-dollar import
-- rows never surface here. Name resolved to a clean display name. The full-table
-- aggregate runs once per daily pick (~0.9s on Dev). Cleaned rows only.
-- ---------------------------------------------------------------------------
create or replace function public.get_top_committee_spenders(
  _limit int default 100,
  _exclude_ids text[] default '{}'
)
returns table (
  fec_committee_id text,
  name text,
  total_spent bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.spending_committee_fec_id as fec_committee_id,
    public.resolve_committee_name(t.spending_committee_fec_id, t.spending_committee_name) as name,
    t.total_amount::bigint as total_spent
  from public.committee_independent_expenditure_totals t
  where t.spending_committee_fec_id is not null
    and t.total_amount > 0
    and not (t.spending_committee_fec_id = any(coalesce(_exclude_ids, '{}'::text[])))
  order by t.total_amount desc
  limit greatest(1, coalesce(_limit, 100));
$$;

grant execute on function public.get_top_committee_spenders(int, text[])
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verified facts for one outside-spender's card, keyed by fec_committee_id.
-- Mirrors /committee/:id IE section: clean name, total spent, support/oppose
-- split, top ≤3 targets (who the PAC spent on, support vs oppose), optional
-- classified cause. Fast: per-committee lookups ride idx_ie_spending_committee_fec_id
-- (measured ~3ms for the biggest spender on Dev). Cause is OPTIONAL (null when
-- unclassified).
-- ---------------------------------------------------------------------------
create or replace function public.get_committee_card_facts(_fec_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with roll as (
    -- Totals from the cleaned rollup (authoritative; matches /top-spenders).
    select t.spending_committee_fec_id as fec_id,
           t.spending_committee_name as raw_name,
           t.total_amount::bigint as total_spent,
           t.support_amount::bigint as support_total,
           t.oppose_amount::bigint as oppose_total
    from public.committee_independent_expenditure_totals t
    where t.spending_committee_fec_id = _fec_id
    limit 1
  ),
  targets as (
    -- Top 3 candidates this PAC spent on, grouped like the in-app IE section
    -- (key = target fec id, else candidate_id, else target name), with the larger
    -- of support/oppose deciding the direction shown. Index scan on fec id → fast.
    select coalesce(jsonb_agg(r order by r_amount desc), '[]'::jsonb) as items
    from (
      select jsonb_build_object(
               'name', tname,
               'amount', amt,
               'dir', case when sup >= opp then 'support' else 'oppose' end
             ) as r,
             amt as r_amount
      from (
        select
          coalesce(max(c.name), max(ie.target_candidate_name), 'Unknown') as tname,
          sum(ie.amount)::bigint as amt,
          sum(case when ie.support_oppose_indicator = 'S' then ie.amount else 0 end)::bigint as sup,
          sum(case when ie.support_oppose_indicator <> 'S' then ie.amount else 0 end)::bigint as opp
        from public.independent_expenditures ie
        left join public.candidates c on c.id = ie.candidate_id
        where ie.spending_committee_fec_id = _fec_id
          and ie.amount > 0
        group by coalesce(ie.target_fec_candidate_id, ie.candidate_id, ie.target_candidate_name)
        order by amt desc
        limit 3
      ) g
    ) z
  ),
  cause as (
    -- Optional classified cause for this committee.
    select jsonb_build_object('label', cc.label, 'reasoning', nullif(btrim(ct.ai_reasoning), '')) as obj
    from public.committee_topics ct
    join public.committee_causes cc on cc.id = ct.primary_cause_id
    where ct.fec_committee_id = _fec_id
      and ct.primary_cause_id is not null
    limit 1
  )
  select case when (select count(*) from roll) = 0 then null else
    jsonb_build_object(
      'name',          public.resolve_committee_name(_fec_id, (select raw_name from roll)),
      'total_spent',   (select total_spent from roll),
      'support_total', (select support_total from roll),
      'oppose_total',  (select oppose_total from roll),
      'top_targets',   (select items from targets),
      'cause',         (select obj from cause)
    )
  end;
$$;

grant execute on function public.get_committee_card_facts(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rotation: re-add committee_spender (now the outside-spender entity card)
-- alongside rep_profile + the donor-entity top_donor card.
-- ---------------------------------------------------------------------------
update public.social_post_settings
  set rotation_types = ARRAY['rep_profile', 'committee_spender', 'top_donor']
  where id = 1;

alter table public.social_post_settings
  alter column rotation_types set default ARRAY['rep_profile', 'committee_spender', 'top_donor'];
