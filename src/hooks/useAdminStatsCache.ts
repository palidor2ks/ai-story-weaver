import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatKey =
  | "voting_records_stats"
  | "candidate_answer_stats"
  | "fec_stats"
  | "bills_stats"
  | "state_finance_stats"
  | "finance_recon_stats"
  | "identity_stats";

export interface VotingRecordsStats {
  legislativeActions: number;
  floorVotes: number;
  totalRecords: number;
  membersSynced: number;
  coveragePercentage: number;
  // Extended stats for compatibility
  membersWithFloorVotes?: number;
  // Truth fields added by refresh_admin_stats_cache (migration 20260610170000)
  syncErrors?: number;
  floorSyncErrors?: number;
  incompleteMembers?: number;
  latestSync?: string | null;
}

export interface CandidateAnswerStats {
  totalCandidates: number;
  totalQuestions: number;
  noAnswers: number;
  lowCoverage: number;
  fullCoverage: number;
  totalAnswers: number;
  totalSourced: number;
  // Stricter signal: answers carrying an actual source URL (not just a description)
  sourcedWithUrl?: number;
  latestUpdate?: string | null;
}

export interface FecStats {
  withFecId: number;
  neverSynced: number;
  partialSync: number;
  complete: number;
}

export interface BillsStats {
  totalBills: number;
  totalSponsors: number;
  lastNightlySync: string | null;
  staleDays: number;
  lastError: string | null;
}

export interface StateFinanceEntry {
  contributions: number;
  lastRun: string | null;
  errors7d: number;
}

export interface StateFinanceStats {
  nj: StateFinanceEntry;
  fl: StateFinanceEntry;
  ny: StateFinanceEntry;
}

export interface FinanceReconStats {
  ok: number;
  warning: number;
  partial: number;
  error: number;
  latestCheck: string | null;
  errorGapUsd: number;
}

export interface IdentityStats {
  candidates: number;
  persons: number;
  auditedMerges: number;
}

interface CacheRow {
  stat_key: string;
  stat_value: unknown;
  updated_at: string;
}

export function useAdminStatsCache<T>(statKey: StatKey) {
  return useQuery({
    queryKey: ["admin-stats-cache", statKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_stats_cache")
        .select("stat_value, updated_at")
        .eq("stat_key", statKey)
        .single();

      if (error) {
        console.error(`[useAdminStatsCache] Error fetching ${statKey}:`, error);
        throw error;
      }

      return {
        data: data.stat_value as T,
        updatedAt: data.updated_at,
      };
    },
    // The cache rows are now recomputed server-side every 15 minutes (pg_cron →
    // refresh_admin_stats_cache), so re-read them instead of pinning forever.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useRefreshAdminStats() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (statKey: StatKey | "all") => {
      console.log(`[useRefreshAdminStats] Refreshing ${statKey}...`);
      
      const { data, error } = await supabase.functions.invoke("refresh-admin-stats", {
        body: { statKey },
      });

      if (error) {
        console.error("[useRefreshAdminStats] Error:", error);
        throw error;
      }

      return data;
    },
    onSuccess: (_, statKey) => {
      // Invalidate the specific cache or all caches
      if (statKey === "all") {
        queryClient.invalidateQueries({ queryKey: ["admin-stats-cache"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["admin-stats-cache", statKey] });
      }
    },
  });
}

// Convenience hooks for specific stat types
export function useVotingRecordsStatsCache() {
  return useAdminStatsCache<VotingRecordsStats>("voting_records_stats");
}

export function useCandidateAnswerStatsCache() {
  return useAdminStatsCache<CandidateAnswerStats>("candidate_answer_stats");
}

export function useFecStatsCache() {
  return useAdminStatsCache<FecStats>("fec_stats");
}

export function useBillsStatsCache() {
  return useAdminStatsCache<BillsStats>("bills_stats");
}

export function useStateFinanceStatsCache() {
  return useAdminStatsCache<StateFinanceStats>("state_finance_stats");
}

export function useFinanceReconStatsCache() {
  return useAdminStatsCache<FinanceReconStats>("finance_recon_stats");
}

export function useIdentityStatsCache() {
  return useAdminStatsCache<IdentityStats>("identity_stats");
}
