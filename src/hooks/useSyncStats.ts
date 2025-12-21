import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SyncStats {
  totalCandidates: number;
  syncedCandidates: number;
  pendingCandidates: number;
  totalAnswers: number;
  lastSyncTime: string | null;
  oldestPendingCandidate: string | null;
  candidatesWithAnswers: number;
  avgAnswersPerCandidate: number;
}

export function useSyncStats() {
  return useQuery({
    queryKey: ['sync-stats'],
    queryFn: async (): Promise<SyncStats> => {
      // Get candidate sync stats
      const { data: candidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('id, name, last_answers_sync');

      if (candidatesError) throw candidatesError;

      const totalCandidates = candidates?.length || 0;
      const syncedCandidates = candidates?.filter(c => c.last_answers_sync !== null).length || 0;
      const pendingCandidates = totalCandidates - syncedCandidates;

      // Find most recent sync
      const syncTimes = candidates
        ?.filter(c => c.last_answers_sync)
        .map(c => new Date(c.last_answers_sync!).getTime()) || [];
      const lastSyncTime = syncTimes.length > 0 
        ? new Date(Math.max(...syncTimes)).toISOString()
        : null;

      // Find oldest pending candidate
      const pendingCandidate = candidates?.find(c => !c.last_answers_sync);
      const oldestPendingCandidate = pendingCandidate?.name || null;

      // Get answer stats
      const { count: totalAnswers, error: answersError } = await supabase
        .from('candidate_answers')
        .select('*', { count: 'exact', head: true });

      if (answersError) throw answersError;

      // Get candidates with at least one answer
      const { data: candidatesWithAnswersData, error: cwError } = await supabase
        .from('candidate_answers')
        .select('candidate_id');

      if (cwError) throw cwError;

      const uniqueCandidatesWithAnswers = new Set(candidatesWithAnswersData?.map(a => a.candidate_id) || []);
      const candidatesWithAnswers = uniqueCandidatesWithAnswers.size;

      const avgAnswersPerCandidate = candidatesWithAnswers > 0 
        ? Math.round((totalAnswers || 0) / candidatesWithAnswers)
        : 0;

      return {
        totalCandidates,
        syncedCandidates,
        pendingCandidates,
        totalAnswers: totalAnswers || 0,
        lastSyncTime,
        oldestPendingCandidate,
        candidatesWithAnswers,
        avgAnswersPerCandidate,
      };
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
  });
}
