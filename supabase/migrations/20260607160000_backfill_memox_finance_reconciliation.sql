-- Backfill: strip Schedule A "memo" (memo_code = 'X') contamination out of the
-- cached finance_reconciliation snapshots.
--
-- Problem
-- -------
-- A historical reconciliation run summed FEC Schedule A *memo* entries
-- (memo_code = 'X') into finance_reconciliation.local_itemized. Those rows are
-- informational sub-itemizations of earmarked conduit (e.g. ActBlue) money that
-- is already counted in the committee's real receipt lines, so summing them
-- double-counts — wildly. The worst row (VINDMAN, ALEXANDER 2026) stored
-- local_itemized = $923.5M against $8.2M of real FEC receipts, because the
-- candidate's contributions table holds ~$1.5B of memo_code='X' rows on top of
-- ~$3M of real receipts. This made the dashboard's "Local" column exceed "FEC
-- Total", i.e. a positive Total-Receipts delta / >100% coverage that is not real.
--
-- Fix
-- ---
-- Recompute the *local* side of each overstated row directly from the
-- contributions table using the same definitions as get_contribution_totals()
-- (which already excludes memo_code='X'):
--   local_itemized = SUM(lines 11AI + 11B + 11C, excluding memo_code='X')
-- and recompute the dependent category totals, deltas and status exactly as
-- supabase/functions/nightly-finance-reconciliation does. The FEC-side columns
-- are authoritative and left untouched.
--
-- Scope: only rows where the stored local_itemized exceeds the recomputed
-- (memo-X-free) value — i.e. the contaminated rows. Idempotent: once corrected,
-- local_itemized == recomputed value and the WHERE clause no longer matches.
--
-- Robustness: several finance_reconciliation columns this backfill touches
-- (local_loans, local_other_receipts, the per-category deltas, etc.) exist on
-- the live databases but were added via direct DDL and never captured in a
-- migration file. A database rebuilt purely from migrations (e.g. a Supabase
-- preview branch) therefore lacks them. To stay portable, the data fix is
-- guarded: it runs only where the full schema is present and is skipped (no-op)
-- otherwise, instead of failing the migration. The missing-column schema drift
-- should be reconciled separately.

do $do$
begin
  -- Skip cleanly if the table or any referenced column is absent on this DB.
  if exists (
    select 1
    from unnest(array[
      'id','candidate_id','cycle',
      'local_itemized','local_itemized_net','local_individual_itemized',
      'local_gross_individual','memo_x_amount','local_organization',
      'local_pac_contributions','local_party_contributions','local_transfers',
      'local_loans','local_other_receipts',
      'individual_delta_amount','individual_delta_pct',
      'pac_delta_amount','pac_delta_pct','delta_amount','delta_pct',
      'total_receipts_delta_amount','total_receipts_delta_pct',
      'status','checked_at','updated_at','notes',
      'fec_itemized','fec_pac_contributions','fec_party_contributions',
      'fec_transfers','fec_loans','fec_other_receipts',
      'fec_offsets_to_operating_expenditures','fec_unitemized',
      'fec_candidate_contribution','fec_total_receipts'
    ]) as req(col)
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public'
        and ic.table_name = 'finance_reconciliation'
        and ic.column_name = req.col
    )
  ) then
    raise notice 'memo-X backfill skipped: finance_reconciliation is missing expected columns on this database (schema drift); no rows changed.';
    return;
  end if;

  execute $sql$
    with agg as (
      select
        com.candidate_id,
        c.cycle,
        sum(case when c.line_number = '11AI' and c.contributor_type = 'Individual'
                  and coalesce(c.memo_code,'') <> 'X' and coalesce(c.is_contribution,true) = true
                 then c.amount else 0 end)                                              as ind,
        sum(case when c.line_number = '11AI' and c.contributor_type = 'Individual'
                  and coalesce(c.is_contribution,true) = true
                 then c.amount else 0 end)                                              as ind_gross,
        sum(case when c.line_number = '11AI' and c.contributor_type in ('Organization','Unknown')
                  and coalesce(c.memo_code,'') <> 'X' and coalesce(c.is_contribution,true) = true
                 then c.amount else 0 end)                                              as org,
        sum(case when c.line_number = '11C'
                  and coalesce(c.memo_code,'') <> 'X' and coalesce(c.is_contribution,true) = true
                 then c.amount else 0 end)                                              as pac,
        sum(case when c.line_number = '11B'
                  and coalesce(c.memo_code,'') <> 'X' and coalesce(c.is_contribution,true) = true
                 then c.amount else 0 end)                                              as party,
        sum(case when c.line_number = '12'
                  and coalesce(c.memo_code,'') <> 'X' and coalesce(c.is_contribution,true) = true
                 then c.amount else 0 end)                                              as transfers,
        sum(case when c.line_number like '13%'
                  and coalesce(c.memo_code,'') <> 'X'
                 then c.amount else 0 end)                                              as loans,
        sum(case when c.line_number not in ('11AI','11B','11C')
                  and coalesce(c.memo_code,'') <> 'X' and coalesce(c.is_contribution,true) = true
                 then c.amount else 0 end)                                              as other_total,
        sum(case when c.line_number = '11C' and c.is_earmarked = true
                  and coalesce(c.memo_code,'') <> 'X'
                 then c.amount else 0 end)                                              as pass_through
      from public.contributions c
      join public.candidate_committees com on c.recipient_committee_id = com.fec_committee_id
      where com.active = true and com.designation in ('P','A')
      group by com.candidate_id, c.cycle
    ),
    recompute as (
      select
        fr.id,
        (a.ind + a.org + a.pac + a.party)                                              as new_itemized,
        (a.ind + a.org + a.pac + a.party) - a.pass_through                             as new_itemized_net,
        a.ind                                                                          as new_individual,
        a.ind_gross                                                                    as new_individual_gross,
        a.ind_gross - a.ind                                                            as new_memo_x_amount,
        a.org                                                                          as new_organization,
        a.pac                                                                          as new_pac,
        a.party                                                                        as new_party,
        a.transfers                                                                    as new_transfers,
        a.loans                                                                        as new_loans,
        a.other_total                                                                  as new_other_receipts,
        ((a.ind + a.org) - coalesce(fr.fec_itemized,0))                                as new_ind_delta,
        case when coalesce(fr.fec_itemized,0) > 0
             then round((((a.ind + a.org) - fr.fec_itemized) / fr.fec_itemized) * 100, 2)
             else 0 end                                                               as new_ind_delta_pct,
        (a.pac - coalesce(fr.fec_pac_contributions,0))                                 as new_pac_delta,
        case when coalesce(fr.fec_pac_contributions,0) > 0
             then round(((a.pac - fr.fec_pac_contributions) / fr.fec_pac_contributions) * 100, 2)
             else 0 end                                                               as new_pac_delta_pct,
        (((a.ind + a.org) + a.pac + a.party)
           - (coalesce(fr.fec_itemized,0) + coalesce(fr.fec_pac_contributions,0) + coalesce(fr.fec_party_contributions,0)))
                                                                                       as new_delta_amount,
        case when (coalesce(fr.fec_itemized,0) + coalesce(fr.fec_pac_contributions,0) + coalesce(fr.fec_party_contributions,0)) > 0
             then round(
               ((((a.ind + a.org) + a.pac + a.party)
                   - (coalesce(fr.fec_itemized,0) + coalesce(fr.fec_pac_contributions,0) + coalesce(fr.fec_party_contributions,0)))
                / (coalesce(fr.fec_itemized,0) + coalesce(fr.fec_pac_contributions,0) + coalesce(fr.fec_party_contributions,0))) * 100, 2)
             else 0 end                                                               as new_delta_pct,
        case when coalesce(fr.fec_total_receipts,0) > 0
             then round(
               (a.ind + a.org + a.pac + a.party)
               + greatest(a.transfers, coalesce(fr.fec_transfers,0))
               + greatest(a.loans, coalesce(fr.fec_loans,0))
               + greatest(a.other_total, coalesce(fr.fec_other_receipts,0) + coalesce(fr.fec_offsets_to_operating_expenditures,0))
               + coalesce(fr.fec_unitemized,0) + coalesce(fr.fec_candidate_contribution,0)
               - fr.fec_total_receipts)
             else null end                                                            as new_tr_delta_amount,
        case when coalesce(fr.fec_total_receipts,0) > 0
             then (
               (a.ind + a.org + a.pac + a.party)
               + greatest(a.transfers, coalesce(fr.fec_transfers,0))
               + greatest(a.loans, coalesce(fr.fec_loans,0))
               + greatest(a.other_total, coalesce(fr.fec_other_receipts,0) + coalesce(fr.fec_offsets_to_operating_expenditures,0))
               + coalesce(fr.fec_unitemized,0) + coalesce(fr.fec_candidate_contribution,0)
               - fr.fec_total_receipts) / fr.fec_total_receipts * 100
             else null end                                                            as new_tr_delta_pct
      from public.finance_reconciliation fr
      join agg a on a.candidate_id = fr.candidate_id and a.cycle = fr.cycle
      where fr.local_itemized > (a.ind + a.org + a.pac + a.party) + 1
    )
    update public.finance_reconciliation fr set
      local_itemized              = r.new_itemized,
      local_itemized_net          = r.new_itemized_net,
      local_individual_itemized   = r.new_individual,
      local_gross_individual      = r.new_individual_gross,
      memo_x_amount               = r.new_memo_x_amount,
      local_organization          = r.new_organization,
      local_pac_contributions     = r.new_pac,
      local_party_contributions   = r.new_party,
      local_transfers             = r.new_transfers,
      local_loans                 = r.new_loans,
      local_other_receipts        = r.new_other_receipts,
      individual_delta_amount     = r.new_ind_delta,
      individual_delta_pct        = r.new_ind_delta_pct,
      pac_delta_amount            = r.new_pac_delta,
      pac_delta_pct               = r.new_pac_delta_pct,
      delta_amount                = r.new_delta_amount,
      delta_pct                   = r.new_delta_pct,
      total_receipts_delta_amount = r.new_tr_delta_amount,
      total_receipts_delta_pct    = r.new_tr_delta_pct,
      status = case
                 when abs(r.new_delta_pct) > 10 then 'error'
                 when abs(r.new_delta_pct) > 5  then 'warning'
                 else 'ok'
               end,
      checked_at = now(),
      updated_at = now(),
      notes = coalesce(fr.notes || ' | ', '') || 'memo-X itemized backfill 2026-06-07 (excludes Schedule A memo_code=X)'
    from recompute r
    where r.id = fr.id;
  $sql$;
end
$do$;
