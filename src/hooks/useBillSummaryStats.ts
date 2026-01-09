import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SummaryStats {
  totalVotes: number;
  withSummary: number;
  withCrsSummary: number;
  withAiSummary: number;
  noSummaryAvailable: number;
  notYetFetched: number;
  pending: number;
  missingCongress: number;
  floorVotesNoBill: number;
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
      // Single fast query to materialized view instead of 12 parallel queries
      // This avoids statement timeout errors on the 856K+ row votes table
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
        // Return empty stats if view is empty
        return {
          totalVotes: 0,
          withSummary: 0,
          withCrsSummary: 0,
          withAiSummary: 0,
          noSummaryAvailable: 0,
          notYetFetched: 0,
          pending: 0,
          coveragePct: 0,
          floorVotesNoBill: 0,
          fullTextTitles: 0,
          unparseableBillIds: 0,
          missingCongress: 0,
          processableVotes: 0,
          lastRefreshed: null,
        };
      }

      // Calculate derived values
      const withCrsSummary = Number(data.with_crs_summary) || 0;
      const withAiSummary = Number(data.with_ai_summary) || 0;
      const withSummary = withCrsSummary + withAiSummary;
      const totalVotes = Number(data.total_votes) || 0;
      const noSummaryAvailable = Number(data.no_summary_available) || 0;
      const notYetFetched = Number(data.not_yet_fetched) || 0;
      const floorVotesNoBill = Number(data.floor_votes_no_bill) || 0;
      const fullTextTitles = Number(data.full_text_titles) || 0;
      const unparseableBillIds = Number(data.unparseable_bill_ids) || 0;
      const missingCongress = Number(data.missing_congress) || 0;
      
      const notProcessable = floorVotesNoBill + fullTextTitles + unparseableBillIds + missingCongress;
      const processableVotes = Math.max(0, totalVotes - notProcessable);
      const pending = Math.max(0, processableVotes - withSummary - noSummaryAvailable);
      const coveragePct = processableVotes > 0 
        ? Math.round((withSummary / processableVotes) * 100) 
        : 0;

      return {
        totalVotes,
        withSummary,
        withCrsSummary,
        withAiSummary,
        noSummaryAvailable,
        notYetFetched,
        pending,
        coveragePct,
        floorVotesNoBill,
        fullTextTitles,
        unparseableBillIds,
        missingCongress,
        processableVotes,
        lastRefreshed: data.last_refreshed || null,
      };
    },
    staleTime: 60000, // 1 minute
  });
}
