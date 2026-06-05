-- Perf fix for get_donor_card_facts (donor-entity social card).
--
-- The original (20260605020000) filtered the donor's contribution rows with
--   lower(coalesce(d.display_name, d.name)) = lower(t.display_name)
-- which can't use any index, so every call sequentially scanned the full
-- ~2.2M-row public.donors table TWICE (location + top recipients). A single
-- card took ~13s — well past the edge function's statement timeout, so
-- render-social-card got a null back and threw "donor_not_found".
--
-- public.donors already has idx_donors_display_name on (display_name), and the
-- per-cycle MV has donor_consolidated_mv_display_name_idx on (display_name), so
-- matching the consolidated display_name EXACTLY turns those scans into index
-- scans. Measured on the live DB: ~0.36s per donor (incl. ActBlue's 249k rows),
-- down from 13s. The consolidated display_name is itself a real donor-row value,
-- so an exact match captures the dominant-name rows (federal subset, as before).
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
    select count(*)::int as cycle_count
    from private.donor_consolidated_mv pm, target t
    where pm.display_name = t.display_name
  ),
  loc as (
    -- exact display_name match → uses idx_donors_display_name (no full scan)
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
    -- Top 3 federal recipients (candidate name, else receiving committee name).
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
    -- Optional classified cause: a direct donor_cause_overrides row wins, else
    -- the alias-level cause matched by canonical_name. Null when neither applies.
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
      'top_recipients',  (select items from recips),
      'cause',           (select obj from cause)
    )
  end;
$$;
