-- Finding A (FEC reconciliation): surface total-receipts COMPLETENESS as its own signal, distinct
-- from the itemized-accuracy `status`.
--
-- Why: `status` answers "does our itemized data match FEC's itemized?" (accuracy of what we hold).
-- It deliberately gates on the comparable-itemized delta and ignores total receipts. But ~363 rows
-- are `status='ok'` yet materially off on TOTAL receipts — overwhelmingly coverage gaps (local has
-- far less than FEC reports) the itemized check can't see, plus a few over-imports. Folding total
-- receipts into `status` would conflate accuracy with completeness and flood the error list. Instead
-- we add a separate `total_receipts_status` so completeness is visible without polluting accuracy.
--
-- Tiers (vs FEC total receipts): 'ok' = within ±10%; 'under' = local < FEC by >10% (we're MISSING
-- receipts FEC reports — a coverage gap); 'over' = local > FEC by >10% (possible over-import or FEC
-- cycle-window lag). NULL when there's no FEC total to compare against.
--
-- Read/reporting column only; written by nightly-finance-reconciliation and refresh-fec-totals
-- alongside the existing total_receipts_delta_pct. Backfill below derives it from that stored pct.

ALTER TABLE public.finance_reconciliation
  ADD COLUMN IF NOT EXISTS total_receipts_status text;

COMMENT ON COLUMN public.finance_reconciliation.total_receipts_status IS
  'Completeness signal vs FEC total receipts (separate from itemized-accuracy `status`): '
  'ok = within ±10%; under = local < FEC by >10% (missing receipts / coverage gap); '
  'over = local > FEC by >10% (over-import or FEC cycle lag); NULL = no FEC total to compare.';

-- Backfill from the already-computed total_receipts_delta_pct (trustworthy post Finding-B fix).
UPDATE public.finance_reconciliation
SET total_receipts_status = CASE
  WHEN total_receipts_delta_pct IS NULL THEN NULL
  WHEN abs(total_receipts_delta_pct) <= 10 THEN 'ok'
  WHEN total_receipts_delta_pct < 0 THEN 'under'
  ELSE 'over'
END;
