import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SummaryStats {
  totalBills: number;
  withSummary: number;
  withCrsSummary: number;
  withAiSummary: number;
  withAiProceduralSummary: number;
  noSummaryAvailable: number;
  pendingFetch: number;
  coveragePct: number;
  flaggedCount: number;
  mismatchCount: number;
  multiTopicCount: number;
  omnibusCount: number;
  congress118Count: number;
  congress119Count: number;
  lastRefreshed: string | null;
}

export function useBillSummaryStats() {
  return useQuery<SummaryStats>({
    queryKey: ['bill-summary-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_summary_stats')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching bill summary stats:', error);
        throw error;
      }

      if (!data) {
        return {
          totalBills: 0, withSummary: 0, withCrsSummary: 0, withAiSummary: 0,
          withAiProceduralSummary: 0, noSummaryAvailable: 0, pendingFetch: 0,
          coveragePct: 0, flaggedCount: 0, mismatchCount: 0, multiTopicCount: 0,
          omnibusCount: 0, congress118Count: 0, congress119Count: 0, lastRefreshed: null,
        };
      }

      const rawData = data as Record<string, unknown>;
      const withCrsSummary = Number(rawData.with_crs_summary) || 0;
      const withAiSummary = Number(rawData.with_ai_summary) || 0;
      const withAiProceduralSummary = Number(rawData.with_ai_procedural_summary) || 0;
      const withSummary = withCrsSummary + withAiSummary + withAiProceduralSummary;
      const totalBills = Number(rawData.total_bills) || 0;
      const noSummaryAvailable = Number(rawData.no_summary_available) || 0;
      const pendingFetch = Number(rawData.pending_fetch) || 0;
      
      const coveragePct = totalBills > 0 ? Math.round((withSummary / totalBills) * 100) : 0;

      return {
        totalBills,
        withSummary,
        withCrsSummary,
        withAiSummary,
        withAiProceduralSummary,
        noSummaryAvailable,
        pendingFetch,
        coveragePct,
        flaggedCount: Number(rawData.flagged_count) || 0,
        mismatchCount: Number(rawData.mismatch_count) || 0,
        multiTopicCount: Number(rawData.multi_topic_count) || 0,
        omnibusCount: Number(rawData.omnibus_count) || 0,
        congress118Count: Number(rawData.congress_118_count) || 0,
        congress119Count: Number(rawData.congress_119_count) || 0,
        lastRefreshed: rawData.last_refreshed ? String(rawData.last_refreshed) : null,
      };
    },
    staleTime: 60000,
  });
}
