import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CongressStats {
  congress: number;
  total_votes: number;
  with_summary: number;
  no_summary_available: number;
  pending: number;
  coverage_pct: number;
}

interface ActionTypeStats {
  action_type: string;
  total_votes: number;
  with_summary: number;
  coverage_pct: number;
}

interface CandidateStats {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  total_votes: number;
  with_summary: number;
  coverage_pct: number;
}

interface SummaryStats {
  totalVotes: number;
  withSummary: number;
  withCrsSummary: number;         // Has real CRS summary
  withAiSummary: number;          // Has AI-generated summary [AI] prefix
  noSummaryAvailable: number;     // Marked as [NO_SUMMARY] - needs AI
  notYetFetched: number;          // bill_summary IS NULL - needs CRS fetch
  pending: number;
  missingCongress: number;
  floorVotesNoBill: number;       // Floor votes with VOTE-xxx IDs
  fullTextTitles: number;         // Full-text bill titles (not IDs)
  unparseableBillIds: number;     // Bill IDs that couldn't be parsed
  processableVotes: number;       // Votes that can have summaries fetched
  coveragePct: number;
  byCongress: CongressStats[];
  byActionType: ActionTypeStats[];
  topCandidates: CandidateStats[];
}

export function useBillSummaryStats() {
  return useQuery<SummaryStats>({
    queryKey: ['bill-summary-stats'],
    queryFn: async () => {
      // Fetch all stats in parallel
      const [
        totalResult,
        withSummaryResult,
        withAiSummaryResult,
        noSummaryResult,
        notYetFetchedResult,
        floorVoteResult,
        fullTextTitleResult,
        unparseableResult,
        missingCongressResult,
        congressStatsResult,
        actionStatsResult,
        candidateStatsResult
      ] = await Promise.all([
        // Total votes
        supabase.from('votes').select('*', { count: 'exact', head: true }),
        
        // With actual summary (not special markers, includes AI)
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .not('bill_summary', 'is', null)
          .neq('bill_summary', '[NO_SUMMARY]')
          .neq('bill_summary', '[FLOOR_VOTE]')
          .neq('bill_summary', '[TITLE_NOT_ID]')
          .neq('bill_summary', '[UNPARSEABLE]'),
        
        // With AI-generated summary (starts with [AI])
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .ilike('bill_summary', '[AI]%'),
        
        // Not yet fetched (NULL bill_summary, but has valid bill_id and congress)
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .is('bill_summary', null)
          .not('bill_id', 'ilike', 'VOTE-%')
          .not('congress', 'is', null),
        
        // Marked as no summary available
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('bill_summary', '[NO_SUMMARY]'),
        
        // Floor votes (VOTE-xxx IDs that can't have summaries)
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .ilike('bill_id', 'VOTE-%'),
        
        // Full-text titles (marked as such)
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('bill_summary', '[TITLE_NOT_ID]'),
        
        // Unparseable bill IDs
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('bill_summary', '[UNPARSEABLE]'),
        
        // Missing congress number
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .is('congress', null),
        
        // Stats by congress (sample approach for performance)
        supabase.from('votes')
          .select('congress, bill_summary')
          .not('congress', 'is', null)
          .limit(50000),
        
        // Stats by action type
        supabase.from('votes')
          .select('action_type, bill_summary')
          .limit(50000),
        
        // Candidate stats with joins
        supabase.from('votes')
          .select(`
            candidate_id,
            bill_summary,
            candidates!inner(name, party, office)
          `)
          .limit(50000)
      ]);

      const totalVotes = totalResult.count || 0;
      const withSummary = withSummaryResult.count || 0;
      const withAiSummary = withAiSummaryResult.count || 0;
      const withCrsSummary = withSummary - withAiSummary; // CRS = total with summary minus AI
      const noSummaryAvailable = noSummaryResult.count || 0;
      const notYetFetched = notYetFetchedResult.count || 0;
      const floorVotesNoBill = floorVoteResult.count || 0;
      const fullTextTitles = fullTextTitleResult.count || 0;
      const unparseableBillIds = unparseableResult.count || 0;
      const missingCongress = missingCongressResult.count || 0;
      
      // Processable = votes with actual bill IDs, congress numbers, and parseable format
      const notProcessable = floorVotesNoBill + fullTextTitles + unparseableBillIds + missingCongress;
      const processableVotes = Math.max(0, totalVotes - notProcessable);
      const pending = Math.max(0, processableVotes - withSummary - noSummaryAvailable);

      // Process congress stats
      const congressMap = new Map<number, { total: number; summary: number; noSummary: number }>();
      (congressStatsResult.data || []).forEach((row: { congress: number; bill_summary: string | null }) => {
        const stats = congressMap.get(row.congress) || { total: 0, summary: 0, noSummary: 0 };
        stats.total++;
        if (row.bill_summary && row.bill_summary !== '[NO_SUMMARY]') {
          stats.summary++;
        } else if (row.bill_summary === '[NO_SUMMARY]') {
          stats.noSummary++;
        }
        congressMap.set(row.congress, stats);
      });

      const byCongress: CongressStats[] = Array.from(congressMap.entries())
        .map(([congress, stats]) => ({
          congress,
          total_votes: stats.total,
          with_summary: stats.summary,
          no_summary_available: stats.noSummary,
          pending: stats.total - stats.summary - stats.noSummary,
          coverage_pct: stats.total > 0 ? Math.round((stats.summary / stats.total) * 100) : 0
        }))
        .sort((a, b) => b.congress - a.congress);

      // Process action type stats
      const actionMap = new Map<string, { total: number; summary: number }>();
      (actionStatsResult.data || []).forEach((row: { action_type: string | null; bill_summary: string | null }) => {
        const type = row.action_type || 'Unknown';
        const stats = actionMap.get(type) || { total: 0, summary: 0 };
        stats.total++;
        if (row.bill_summary && row.bill_summary !== '[NO_SUMMARY]') {
          stats.summary++;
        }
        actionMap.set(type, stats);
      });

      const byActionType: ActionTypeStats[] = Array.from(actionMap.entries())
        .map(([action_type, stats]) => ({
          action_type,
          total_votes: stats.total,
          with_summary: stats.summary,
          coverage_pct: stats.total > 0 ? Math.round((stats.summary / stats.total) * 100) : 0
        }))
        .sort((a, b) => b.total_votes - a.total_votes);

      // Process candidate stats
      const candidateMap = new Map<string, { 
        name: string; party: string; office: string; total: number; summary: number 
      }>();
      (candidateStatsResult.data || []).forEach((row: { 
        candidate_id: string; 
        bill_summary: string | null;
        candidates: { name: string; party: string; office: string } 
      }) => {
        const existing = candidateMap.get(row.candidate_id) || { 
          name: row.candidates.name, 
          party: row.candidates.party, 
          office: row.candidates.office,
          total: 0, 
          summary: 0 
        };
        existing.total++;
        if (row.bill_summary && row.bill_summary !== '[NO_SUMMARY]') {
          existing.summary++;
        }
        candidateMap.set(row.candidate_id, existing);
      });

      const topCandidates: CandidateStats[] = Array.from(candidateMap.entries())
        .map(([candidate_id, stats]) => ({
          candidate_id,
          name: stats.name,
          party: stats.party,
          office: stats.office,
          total_votes: stats.total,
          with_summary: stats.summary,
          coverage_pct: stats.total > 0 ? Math.round((stats.summary / stats.total) * 100) : 0
        }))
        .sort((a, b) => b.total_votes - a.total_votes)
        .slice(0, 20);

      return {
        totalVotes,
        withSummary,
        withCrsSummary,
        withAiSummary,
        noSummaryAvailable,
        notYetFetched,
        pending,
        missingCongress,
        floorVotesNoBill,
        fullTextTitles,
        unparseableBillIds,
        processableVotes,
        coveragePct: processableVotes > 0 ? Math.round((withSummary / processableVotes) * 100) : 0,
        byCongress,
        byActionType,
        topCandidates
      };
    },
    staleTime: 60000 // 1 minute
  });
}
