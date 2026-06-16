import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Headline coverage / FEC / voting numbers for the Coverage & Finance Dashboard,
 * filtered to VISIBLE states only (hidden states excluded server-side via
 * get_hidden_state_codes — see migration 20260616120000).
 *
 * This is display-only and intentionally SEPARATE from the global admin_stats_cache
 * (useAdminStatsCache): that cache stays the whole-database source of truth for the
 * preflight data-accuracy scoreboard and docs/DATA-ACCURACY.md. The dashboard shows the
 * visible-states slice; the accuracy contract is unchanged.
 *
 * Each field mirrors the matching admin_stats_cache definition exactly, so a tile here is
 * the same metric as its global counterpart — only the row set (visible states) differs.
 */
export interface CoverageDashboardStats {
  totalCandidates: number;
  totalQuestions: number; // global (questions are not state-scoped)
  noAnswers: number;
  lowCoverage: number;
  fullCoverage: number;
  totalAnswers: number;
  totalSourced: number;
  withFecId: number;
  neverSynced: number;
  partialSync: number;
  complete: number;
  legislativeActions: number;
  floorVotes: number;
  totalRecords: number;
  membersSynced: number;
  membersWithFloorVotes: number;
  federalMembers: number;
  coveragePercentage: number;
  // Data Accuracy Scoreboard (visible-states slice; bills + state-finance stay global/per-state)
  reconOk: number;
  reconWarning: number;
  reconPartial: number;
  reconError: number;
  reconErrorGapUsd: number;
  reconLatestCheck: string | null;
  auditedMerges: number;
  sourcedWithUrl: number;
}

export function useCoverageDashboardStats() {
  return useQuery({
    queryKey: ["coverage-dashboard-stats"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CoverageDashboardStats> => {
      const { data, error } = await supabase.rpc("get_coverage_dashboard_stats");
      if (error) throw error;
      const r = data?.[0];
      return {
        totalCandidates: Number(r?.total_candidates) || 0,
        totalQuestions: Number(r?.total_questions) || 0,
        noAnswers: Number(r?.no_answers) || 0,
        lowCoverage: Number(r?.low_coverage) || 0,
        fullCoverage: Number(r?.full_coverage) || 0,
        totalAnswers: Number(r?.total_answers) || 0,
        totalSourced: Number(r?.total_sourced) || 0,
        withFecId: Number(r?.with_fec_id) || 0,
        neverSynced: Number(r?.never_synced) || 0,
        partialSync: Number(r?.partial_sync) || 0,
        complete: Number(r?.complete_sync) || 0,
        legislativeActions: Number(r?.legislative_actions) || 0,
        floorVotes: Number(r?.floor_votes) || 0,
        totalRecords: Number(r?.total_records) || 0,
        membersSynced: Number(r?.members_synced) || 0,
        membersWithFloorVotes: Number(r?.members_with_floor_votes) || 0,
        federalMembers: Number(r?.federal_members) || 0,
        coveragePercentage: Number(r?.coverage_percentage) || 0,
        reconOk: Number(r?.recon_ok) || 0,
        reconWarning: Number(r?.recon_warning) || 0,
        reconPartial: Number(r?.recon_partial) || 0,
        reconError: Number(r?.recon_error) || 0,
        reconErrorGapUsd: Number(r?.recon_error_gap_usd) || 0,
        reconLatestCheck: r?.recon_latest_check ?? null,
        auditedMerges: Number(r?.audited_merges) || 0,
        sourcedWithUrl: Number(r?.sourced_with_url) || 0,
      };
    },
  });
}
