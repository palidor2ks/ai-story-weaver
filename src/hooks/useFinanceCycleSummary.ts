import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FinanceCycleSummaryRow {
  cycle: string;
  reps: number;
  repsWithFec: number;
  fecTotal: number;
  localTotal: number;
  delta: number;
  deltaPct: number | null;
  okCount: number;
  warningCount: number;
  errorCount: number;
}

/**
 * Per-cycle FEC vs Local receipt totals across all visible (non-hidden) states.
 * Drives the dashboard's "how much work is left per cycle" summary chart.
 *
 * `local` and `delta` mirror the exact per-row formula the table shows in its
 * Delta column, so the rollup reconciles with what an admin sees per candidate.
 */
export function useFinanceCycleSummary() {
  return useQuery({
    queryKey: ["finance-cycle-summary"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FinanceCycleSummaryRow[]> => {
      const { data, error } = await supabase.rpc("get_finance_cycle_summary");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        cycle: String(r.cycle),
        reps: Number(r.reps) || 0,
        repsWithFec: Number(r.reps_with_fec) || 0,
        fecTotal: Number(r.fec_total) || 0,
        localTotal: Number(r.local_total) || 0,
        delta: Number(r.delta) || 0,
        deltaPct: r.delta_pct === null || r.delta_pct === undefined ? null : Number(r.delta_pct),
        okCount: Number(r.ok_count) || 0,
        warningCount: Number(r.warning_count) || 0,
        errorCount: Number(r.error_count) || 0,
      }));
    },
  });
}
