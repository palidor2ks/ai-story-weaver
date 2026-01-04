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
  noSummaryAvailable: number;
  pending: number;
  missingCongress: number;
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
        noSummaryResult,
        missingCongressResult,
        congressStatsResult,
        actionStatsResult,
        candidateStatsResult
      ] = await Promise.all([
        // Total votes
        supabase.from('votes').select('*', { count: 'exact', head: true }),
        
        // With actual summary (not '[NO_SUMMARY]')
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .not('bill_summary', 'is', null)
          .neq('bill_summary', '[NO_SUMMARY]'),
        
        // Marked as no summary available
        supabase.from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('bill_summary', '[NO_SUMMARY]'),
        
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
      const noSummaryAvailable = noSummaryResult.count || 0;
      const missingCongress = missingCongressResult.count || 0;
      const pending = totalVotes - withSummary - noSummaryAvailable;

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
        noSummaryAvailable,
        pending,
        missingCongress,
        coveragePct: totalVotes > 0 ? Math.round((withSummary / totalVotes) * 100) : 0,
        byCongress,
        byActionType,
        topCandidates
      };
    },
    staleTime: 60000 // 1 minute
  });
}
