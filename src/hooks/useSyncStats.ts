import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CandidateCoverage {
  candidateId: string;
  name: string;
  party: string;
  answerCount: number;
  totalQuestions: number;
  coveragePercent: number;
}

export interface TopicCoverage {
  topicId: string;
  topicName: string;
  icon: string;
  totalQuestions: number;
  totalCandidates: number;
  totalPotentialAnswers: number;
  totalActualAnswers: number;
  coveragePercent: number;
}

interface SyncStats {
  totalCandidates: number;
  totalQuestions: number;
  totalPotentialAnswers: number;
  totalActualAnswers: number;
  overallCoveragePercent: number;
  lastSyncTime: string | null;
  candidateCoverage: CandidateCoverage[];
  topicCoverage: TopicCoverage[];
}

export function useSyncStats() {
  return useQuery({
    queryKey: ['sync-stats'],
    queryFn: async (): Promise<SyncStats> => {
      // Get all candidates
      const { data: candidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('id, name, party, last_answers_sync');

      if (candidatesError) throw candidatesError;

      // Get all questions
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, topic_id');

      if (questionsError) throw questionsError;

      // Get all topics
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name, icon');

      if (topicsError) throw topicsError;

      // Get all answers
      const { data: allAnswers, error: allAnswersError } = await supabase
        .from('candidate_answers')
        .select('question_id, candidate_id');

      if (allAnswersError) throw allAnswersError;

      const totalCandidates = candidates?.length || 0;
      const totalQuestions = questions?.length || 0;
      const totalPotentialAnswers = totalCandidates * totalQuestions;
      const totalActualAnswers = allAnswers?.length || 0;
      const overallCoveragePercent = totalPotentialAnswers > 0 
        ? Math.round((totalActualAnswers / totalPotentialAnswers) * 1000) / 10
        : 0;

      // Find most recent sync
      const syncTimes = candidates
        ?.filter(c => c.last_answers_sync)
        .map(c => new Date(c.last_answers_sync!).getTime()) || [];
      const lastSyncTime = syncTimes.length > 0 
        ? new Date(Math.max(...syncTimes)).toISOString()
        : null;

      // Calculate per-candidate coverage
      const answerCountByCandidate = new Map<string, number>();
      allAnswers?.forEach(a => {
        answerCountByCandidate.set(a.candidate_id, (answerCountByCandidate.get(a.candidate_id) || 0) + 1);
      });

      const candidateCoverage: CandidateCoverage[] = (candidates || [])
        .map(c => {
          const answerCount = answerCountByCandidate.get(c.id) || 0;
          return {
            candidateId: c.id,
            name: c.name,
            party: c.party,
            answerCount,
            totalQuestions,
            coveragePercent: totalQuestions > 0 
              ? Math.round((answerCount / totalQuestions) * 1000) / 10
              : 0,
          };
        })
        .sort((a, b) => b.coveragePercent - a.coveragePercent);

      // Calculate per-topic coverage
      const topicCoverage: TopicCoverage[] = (topics || []).map(topic => {
        const topicQuestions = questions?.filter(q => q.topic_id === topic.id) || [];
        const topicQuestionIds = new Set(topicQuestions.map(q => q.id));
        
        const topicAnswers = allAnswers?.filter(a => topicQuestionIds.has(a.question_id)) || [];
        const totalPotentialForTopic = totalCandidates * topicQuestions.length;

        return {
          topicId: topic.id,
          topicName: topic.name,
          icon: topic.icon,
          totalQuestions: topicQuestions.length,
          totalCandidates,
          totalPotentialAnswers: totalPotentialForTopic,
          totalActualAnswers: topicAnswers.length,
          coveragePercent: totalPotentialForTopic > 0 
            ? Math.round((topicAnswers.length / totalPotentialForTopic) * 1000) / 10
            : 0,
        };
      }).sort((a, b) => b.coveragePercent - a.coveragePercent);

      return {
        totalCandidates,
        totalQuestions,
        totalPotentialAnswers,
        totalActualAnswers,
        overallCoveragePercent,
        lastSyncTime,
        candidateCoverage,
        topicCoverage,
      };
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
  });
}
