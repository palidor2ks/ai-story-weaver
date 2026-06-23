// Canonical finance_reconciliation status logic — ONE rule, shared by every writer.
//
// Three edge functions write finance_reconciliation rows and historically each used a
// slightly different rule, so a candidate's status flip-flopped depending on which ran
// last (fetch-fec-donors err>10/warn>5 on individual-only; refresh-fec-totals ok≤2/warn≤5;
// nightly-finance-reconciliation err>10/warn>5 on comparable). This helper makes them agree.
//
// status meanings:
//   ok      — itemized donors reconcile (≤5%) AND total receipts within 10% of FEC
//   warning — itemized 5–10% off, OR total receipts >10% off (Finding A secondary gate)
//   error   — itemized >10% off, or the FEC category totals don't balance
//   partial — the donor sync is incomplete (has_more), so the comparison isn't final yet
//
// The "comparable itemized" basis everywhere is (individual + PAC + party) vs the matching
// FEC categories — see DATA-ACCURACY.md §1. Callers compute their own deltas (each has
// different inputs available) and pass the resulting percentage; this helper only classifies.

export type ReconStatus = "ok" | "warning" | "error" | "partial";
export type TotalReceiptsStatus = "ok" | "over" | "under" | null;

// Itemized-accuracy band (percent). |delta| > ERROR → error; > WARNING → warning.
export const ITEMIZED_ERROR_PCT = 10;
export const ITEMIZED_WARNING_PCT = 5;
// Total-receipts completeness band: within ±this percent is "ok".
export const TOTAL_RECEIPTS_OK_PCT = 10;

// Derive the total-receipts completeness signal from the % delta (±10% band).
// 'under' = local < FEC (coverage gap); 'over' = local > FEC (over-count); null = no FEC total.
export function deriveTotalReceiptsStatus(
  deltaPct: number | null,
): TotalReceiptsStatus {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return null;
  if (Math.abs(deltaPct) <= TOTAL_RECEIPTS_OK_PCT) return "ok";
  return deltaPct < 0 ? "under" : "over";
}

export function computeReconStatus(opts: {
  itemizedDeltaPct: number; // comparable itemized (individual+pac+party) vs FEC, percent
  totalReceiptsStatus?: TotalReceiptsStatus; // Finding A secondary gate (null = skip)
  isPartial?: boolean; // donor sync incomplete (has_more)
  fecDataBalanced?: boolean; // FEC category totals reconcile to total receipts (default true)
}): ReconStatus {
  const {
    itemizedDeltaPct,
    totalReceiptsStatus = null,
    isPartial = false,
    fecDataBalanced = true,
  } = opts;

  // Sync not finished — the comparison isn't final, so don't grade it yet.
  if (isPartial) return "partial";
  // FEC's own category totals don't add up to its reported receipts — can't trust the compare.
  if (!fecDataBalanced) return "error";

  const absItemized = Math.abs(itemizedDeltaPct);
  if (absItemized > ITEMIZED_ERROR_PCT) return "error";
  if (absItemized > ITEMIZED_WARNING_PCT) return "warning";

  // Finding A: itemized donors reconcile, but total receipts are materially off → warning,
  // not ok. "ok" must mean both the donors AND the headline total agree with FEC.
  if (totalReceiptsStatus !== null && totalReceiptsStatus !== "ok") return "warning";

  return "ok";
}
