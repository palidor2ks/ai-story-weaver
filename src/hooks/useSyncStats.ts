import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TopicCoverage {
  topicId: string;
  topicName: string;
  icon: string;
  totalQuestions: number;
  answeredQuestions: number;
  coveragePercent: number;
  candidatesWithAnswers: number;
}

interface SyncStats {
  totalCandidates: number;
  syncedCandidates: number;
  pendingCandidates: number;
  totalAnswers: number;
  lastSyncTime: string | null;
  oldestPendingCandidate: string | null;
  candidatesWithAnswers: number;
  avgAnswersPerCandidate: number;
  topicCoverage: TopicCoverage[];
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

      // Get topic coverage stats
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name, icon');

      if (topicsError) throw topicsError;

      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, topic_id');

      if (questionsError) throw questionsError;

      const { data: allAnswers, error: allAnswersError } = await supabase
        .from('candidate_answers')
        .select('question_id, candidate_id');

      if (allAnswersError) throw allAnswersError;

      // Calculate topic coverage
      const topicCoverage: TopicCoverage[] = (topics || []).map(topic => {
        const topicQuestions = questions?.filter(q => q.topic_id === topic.id) || [];
        const topicQuestionIds = new Set(topicQuestions.map(q => q.id));
        
        const topicAnswers = allAnswers?.filter(a => topicQuestionIds.has(a.question_id)) || [];
        const answeredQuestionIds = new Set(topicAnswers.map(a => a.question_id));
        const candidatesWithTopicAnswers = new Set(topicAnswers.map(a => a.candidate_id));

        return {
          topicId: topic.id,
          topicName: topic.name,
          icon: topic.icon,
          totalQuestions: topicQuestions.length,
          answeredQuestions: answeredQuestionIds.size,
          coveragePercent: topicQuestions.length > 0 
            ? Math.round((answeredQuestionIds.size / topicQuestions.length) * 100)
            : 0,
          candidatesWithAnswers: candidatesWithTopicAnswers.size,
        };
      }).sort((a, b) => b.coveragePercent - a.coveragePercent);

      return {
        totalCandidates,
        syncedCandidates,
        pendingCandidates,
        totalAnswers: totalAnswers || 0,
        lastSyncTime,
        oldestPendingCandidate,
        candidatesWithAnswers,
        avgAnswersPerCandidate,
        topicCoverage,
      };
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
  });
}
