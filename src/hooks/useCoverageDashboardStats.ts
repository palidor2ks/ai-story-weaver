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
}

interface RawRow {
  total_candidates: number;
  total_questions: number;
  no_answers: number;
  low_coverage: number;
  full_coverage: number;
  total_answers: number | string;
  total_sourced: number | string;
  with_fec_id: number;
  never_synced: number;
  partial_sync: number;
  complete_sync: number;
  legislative_actions: number | string;
  floor_votes: number | string;
  total_records: number | string;
  members_synced: number;
  members_with_floor_votes: number;
  federal_members: number;
  coverage_percentage: number | string;
}

export function useCoverageDashboardStats() {
  return useQuery({
    queryKey: ["coverage-dashboard-stats"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CoverageDashboardStats> => {
      // RPC isn't in the generated types until the migration is applied; cast mirrors the
      // established pattern for new admin RPCs (e.g. get_donors_paginated).
      const { data, error } = await (supabase as any).rpc("get_coverage_dashboard_stats");
      if (error) throw error;
      const r = (data?.[0] ?? {}) as RawRow;
      return {
        totalCandidates: Number(r.total_candidates) || 0,
        totalQuestions: Number(r.total_questions) || 0,
        noAnswers: Number(r.no_answers) || 0,
        lowCoverage: Number(r.low_coverage) || 0,
        fullCoverage: Number(r.full_coverage) || 0,
        totalAnswers: Number(r.total_answers) || 0,
        totalSourced: Number(r.total_sourced) || 0,
        withFecId: Number(r.with_fec_id) || 0,
        neverSynced: Number(r.never_synced) || 0,
        partialSync: Number(r.partial_sync) || 0,
        complete: Number(r.complete_sync) || 0,
        legislativeActions: Number(r.legislative_actions) || 0,
        floorVotes: Number(r.floor_votes) || 0,
        totalRecords: Number(r.total_records) || 0,
        membersSynced: Number(r.members_synced) || 0,
        membersWithFloorVotes: Number(r.members_with_floor_votes) || 0,
        federalMembers: Number(r.federal_members) || 0,
        coveragePercentage: Number(r.coverage_percentage) || 0,
      };
    },
  });
}
