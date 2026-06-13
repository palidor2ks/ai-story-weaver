-- Finance reconciliation: exclude name-matched conduit pass-throughs from the
-- Line-11A organization bucket (the donor layer already does this; the totals
-- RPC did not).
--
-- Problem
-- -------
-- get_contribution_totals / _by_committee compute organization_total as every
-- Line-11AI Organization/Unknown row (net of memo_code='X'), and only routed a
-- row into conduit_excluded when conduit_committee_id IS NOT NULL. But FEC's
-- bulk Schedule A represents an earmarked contribution as a PAIR of rows:
--   * the real donor  — contributor_type='Individual', memo_text
--     "* EARMARKED CONTRIBUTION: SEE BELOW"  (counted, correct)
--   * the conduit memo — contributor_type='Organization', contributor_name
--     'ACTBLUE' (etc.), memo_text "NOTE: ABOVE CONTRIBUTION EARMARKED THROUGH
--     THIS ORGANIZATION", conduit_committee_id NULL
-- FEC tags the conduit memo so it does not double-count; ~85% of them arrived
-- with memo_code NULL instead of 'X', so they slipped past every existing
-- filter and inflated organization_total — i.e. the campaign's own conduit
-- name was being added on top of the individual donors it merely forwarded.
--
-- Verified example (read-only sim before this migration):
--   April McClain Delaney (M001232), 2024 cycle —
--     organization_total $734,006  ->  $2,250   (the rest, $731,756, was ACTBLUE)
--     conduit_excluded    $0        ->  $731,756
--     Line 11A vs FEC     +38.0%    ->  -8.3%
-- Fleet-wide the same defect inflated Line 11A for ~13 candidates in 2024,
-- worst case John Thune at +503.9% ($5.55M of Democracy Engine memos).
-- (The residual ~-8% on Delaney is a separate Schedule-A coverage gap vs FEC's
-- reported F3 summary, not addressed here.)
--
-- Fix
-- ---
-- Align both totals RPCs with the canonical conduit/pass-through rule already
-- shared by the donor layer (supabase/functions/_shared/conduits.ts,
-- src/lib/conduits.ts) and get_candidate_earmark_rollups: a Line-11AI
-- Organization/Unknown row is a conduit/pass-through (-> conduit_excluded, NOT
-- organization_total) when ANY of:
--   * contributor_name matches a known conduit (ACTBLUE / WINRED / DEMOCRACY ENGINE)
--   * conduit_committee_id IS NOT NULL                         (kept)
--   * memo_text contains 'SEE BELOW' or 'EARMARKED CONTRIBUTION:'
-- organization_total and conduit_excluded now partition the same universe
-- (org/unknown, line 11AI, memo!='X', is_contribution) cleanly.
--
-- The contributions table is intentionally left untouched: it stores faithful
-- per-line FEC provenance, and exclusion is an aggregation-layer concern. This
-- migration is therefore pure CREATE OR REPLACE + one additive column; it
-- mutates no row data and is replay-safe.

-- ---------------------------------------------------------------------------
-- 1) Persist the excluded conduit amount so the breakdown UI can label it
--    (parity with memo_x_amount / pass_through_excluded). Additive + idempotent.
-- ---------------------------------------------------------------------------
alter table public.finance_reconciliation
  add column if not exists conduit_excluded integer not null default 0;

comment on column public.finance_reconciliation.conduit_excluded is
  'Line-11A Organization/Unknown dollars excluded from local_organization as '
  'conduit pass-throughs (ActBlue/WinRed/Democracy Engine name match, '
  'conduit_committee_id, or SEE BELOW / EARMARKED CONTRIBUTION: memo_text). '
  'Display-only: these dollars are already counted under the individual donors.';

-- ---------------------------------------------------------------------------
-- 2) Per-candidate totals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_contribution_totals(p_candidate_id text, p_cycle text)
 RETURNS TABLE(individual_total numeric, individual_gross numeric, organization_total numeric, pac_total numeric, party_total numeric, transfer_total numeric, loan_total numeric, offset_total numeric, other_receipts_total numeric, earmarked_total numeric, memo_x_total numeric, conduit_excluded numeric, pass_through_excluded numeric, other_total numeric, grand_total numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_gross,
    -- Organizations on Line 11A, EXCLUDING conduit pass-throughs (see header).
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND NOT (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    -- Conduit pass-throughs removed from organization_total above (same universe).
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  JOIN public.candidate_committees com ON c.recipient_committee_id = com.fec_committee_id
  WHERE com.candidate_id = p_candidate_id
    AND c.cycle = p_cycle
    AND com.active = true
    AND com.designation IN ('P', 'A');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Per-committee totals (same change; mirrors the per-candidate RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
 RETURNS TABLE(individual_total numeric, individual_gross numeric, organization_total numeric, pac_total numeric, party_total numeric, transfer_total numeric, loan_total numeric, offset_total numeric, other_receipts_total numeric, earmarked_total numeric, memo_x_total numeric, conduit_excluded numeric, pass_through_excluded numeric, other_total numeric, grand_total numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_gross,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND NOT (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$function$;
