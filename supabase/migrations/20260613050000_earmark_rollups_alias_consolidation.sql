-- Consolidate earmark rollups by donor alias (canonical name) instead of raw
-- FEC contributor_name.
--
-- Problem: when an org files FEC contributions under multiple names (e.g.
-- "AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE PAC" and "AIPAC"), the RPC
-- returned separate rows for each spelling, double-listing the org on the
-- candidate profile.
--
-- Fix: LEFT JOIN to donor_alias_members + donor_aliases so that matching
-- contributors are grouped under their canonical alias name. Contributors
-- without an alias fall back to the existing upper(btrim(contributor_name))
-- grouping.
--
-- The return type and SECURITY DEFINER posture are unchanged.
-- Replay-safe: CREATE OR REPLACE.

create or replace function public.get_candidate_earmark_rollups(
  p_candidate_id text,
  p_cycle text default null
)
returns table(
  org_label text,
  org_type text,
  cycle text,
  direct_amount bigint,
  direct_count bigint,
  routed_amount bigint,
  routed_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select
      coalesce(a.canonical_name, upper(btrim(c.contributor_name))) as org_key,
      max(coalesce(c.contributor_type, 'Unknown')) as org_type,
      c.cycle,
      sum(c.amount) filter (where upper(btrim(coalesce(c.memo_code,''))) = 'X')  as routed_amount,
      count(*)      filter (where upper(btrim(coalesce(c.memo_code,''))) = 'X')  as routed_count,
      sum(c.amount) filter (
        where upper(btrim(coalesce(c.memo_code,''))) <> 'X'
          and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
          and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
      ) as direct_amount,
      count(*) filter (
        where upper(btrim(coalesce(c.memo_code,''))) <> 'X'
          and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
          and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
      ) as direct_count
    from public.contributions c
    join public.candidate_committees cc
      on cc.fec_committee_id = c.recipient_committee_id
    left join public.donor_alias_members m
      on m.donor_name = upper(btrim(c.contributor_name))
     and m.donor_type = coalesce(c.contributor_type, 'Unknown')
    left join public.donor_aliases a
      on a.id = m.alias_id
     and a.is_active = true
    where p_candidate_id is not null
      and length(p_candidate_id) <= 64
      and cc.candidate_id = p_candidate_id
      and cc.active = true
      and cc.designation in ('P','A','J')
      and coalesce(c.contributor_type, 'Unknown') in ('PAC', 'Organization')
      and upper(coalesce(c.line_number,'')) like '11%'
      and coalesce(c.is_transfer, false) = false
      and coalesce(c.is_contribution, true) = true
      and upper(c.contributor_name) not like '%ACTBLUE%'
      and upper(c.contributor_name) not like '%WINRED%'
      and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%'
      and (p_cycle is null or p_cycle = '' or p_cycle = 'all' or c.cycle = p_cycle)
    group by coalesce(a.canonical_name, upper(btrim(c.contributor_name))), c.cycle
  )
  select
    org_key::text  as org_label,
    org_type::text,
    cycle,
    coalesce(direct_amount, 0)::bigint,
    coalesce(direct_count, 0)::bigint,
    coalesce(routed_amount, 0)::bigint,
    coalesce(routed_count, 0)::bigint
  from lines
  where coalesce(routed_amount, 0) > 0
  order by coalesce(routed_amount, 0) + coalesce(direct_amount, 0) desc, cycle desc
  limit 500;
$$;

comment on function public.get_candidate_earmark_rollups(text, text) is
  'Per (org, cycle) "donated by or through" rollup for earmark-program orgs (e.g. AIPAC): '
  'direct = countable Schedule A dollars under the org''s name; routed = memo-X attribution '
  'dollars (already counted under the individual donors — display-only lens). '
  'Groups by donor_aliases.canonical_name when an active alias exists, otherwise by raw '
  'contributor name. Conduit processors (ActBlue/WinRed/Democracy Engine) excluded by design.';
