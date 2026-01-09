import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SummaryStats {
  totalVotes: number;
  withSummary: number;
  withCrsSummary: number;
  withAiSummary: number;
  withAiProceduralSummary: number;
  noSummaryAvailable: number;
  notYetFetched: number;
  pending: number;
  missingCongress: number;
  proceduralVotesPending: number;
  fullTextTitles: number;
  unparseableBillIds: number;
  processableVotes: number;
  coveragePct: number;
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
          totalVotes: 0, withSummary: 0, withCrsSummary: 0, withAiSummary: 0,
          withAiProceduralSummary: 0, noSummaryAvailable: 0, notYetFetched: 0,
          pending: 0, coveragePct: 0, proceduralVotesPending: 0, fullTextTitles: 0,
          unparseableBillIds: 0, missingCongress: 0, processableVotes: 0, lastRefreshed: null,
        };
      }

      const rawData = data as Record<string, unknown>;
      const withCrsSummary = Number(rawData.with_crs_summary) || 0;
      const withAiSummary = Number(rawData.with_ai_summary) || 0;
      const withAiProceduralSummary = Number(rawData.with_ai_procedural_summary) || 0;
      const withSummary = withCrsSummary + withAiSummary + withAiProceduralSummary;
      const totalVotes = Number(rawData.total_votes) || 0;
      const noSummaryAvailable = Number(rawData.no_summary_available) || 0;
      const notYetFetched = Number(rawData.not_yet_fetched) || 0;
      const proceduralVotesPending = Number(rawData.procedural_votes_pending) || Number(rawData.floor_votes_no_bill) || 0;
      const fullTextTitles = Number(rawData.full_text_titles) || 0;
      const unparseableBillIds = Number(rawData.unparseable_bill_ids) || 0;
      const missingCongress = Number(rawData.missing_congress) || 0;
      
      const notProcessable = fullTextTitles + unparseableBillIds + missingCongress;
      const processableVotes = Math.max(0, totalVotes - notProcessable);
      const pending = Math.max(0, processableVotes - withSummary - noSummaryAvailable);
      const coveragePct = processableVotes > 0 ? Math.round((withSummary / processableVotes) * 100) : 0;

      return {
        totalVotes, withSummary, withCrsSummary, withAiSummary, withAiProceduralSummary,
        noSummaryAvailable, notYetFetched, pending, coveragePct, proceduralVotesPending,
        fullTextTitles, unparseableBillIds, missingCongress, processableVotes,
        lastRefreshed: rawData.last_refreshed ? String(rawData.last_refreshed) : null,
      };
    },
    staleTime: 60000,
  });
}
