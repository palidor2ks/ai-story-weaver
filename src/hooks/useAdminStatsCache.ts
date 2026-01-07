import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatKey = "voting_records_stats" | "candidate_answer_stats" | "fec_stats";

export interface VotingRecordsStats {
  legislativeActions: number;
  floorVotes: number;
  totalRecords: number;
  membersSynced: number;
  coveragePercentage: number;
  // Extended stats for compatibility
  membersWithFloorVotes?: number;
}

export interface CandidateAnswerStats {
  totalCandidates: number;
  totalQuestions: number;
  noAnswers: number;
  lowCoverage: number;
  fullCoverage: number;
  totalAnswers: number;
  totalSourced: number;
}

export interface FecStats {
  withFecId: number;
  neverSynced: number;
  partialSync: number;
  complete: number;
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
    staleTime: Infinity, // Never refetch automatically
    gcTime: Infinity, // Keep in cache forever
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
