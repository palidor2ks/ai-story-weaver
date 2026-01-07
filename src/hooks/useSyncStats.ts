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
      // Use efficient COUNT queries instead of fetching all rows
      const [
        candidatesResult,
        questionsResult,
        topicsResult,
        answersCountResult,
        lastSyncResult,
        answersByTopicResult
      ] = await Promise.all([
        // Get candidate count and basic info
        supabase
          .from('candidates')
          .select('id, name, party, last_answers_sync'),
        // Get questions with topic IDs
        supabase
          .from('questions')
          .select('id, topic_id'),
        // Get all topics
        supabase
          .from('topics')
          .select('id, name, icon'),
        // Get total answer count efficiently
        supabase
          .from('candidate_answers')
          .select('*', { count: 'exact', head: true }),
        // Get last sync time from most recently synced candidate
        supabase
          .from('candidates')
          .select('last_answers_sync')
          .not('last_answers_sync', 'is', null)
          .order('last_answers_sync', { ascending: false })
          .limit(1),
        // Get answer counts grouped by topic (via question_id join)
        supabase
          .from('candidate_answers')
          .select('question_id')
      ]);

      if (candidatesResult.error) throw candidatesResult.error;
      if (questionsResult.error) throw questionsResult.error;
      if (topicsResult.error) throw topicsResult.error;

      const candidates = candidatesResult.data || [];
      const questions = questionsResult.data || [];
      const topics = topicsResult.data || [];
      const totalActualAnswers = answersCountResult.count || 0;
      
      const totalCandidates = candidates.length;
      const totalQuestions = questions.length;
      const totalPotentialAnswers = totalCandidates * totalQuestions;
      const overallCoveragePercent = totalPotentialAnswers > 0 
        ? Math.round((totalActualAnswers / totalPotentialAnswers) * 1000) / 10
        : 0;

      // Get last sync time
      const lastSyncTime = lastSyncResult.data?.[0]?.last_answers_sync || null;

      // Build question -> topic mapping
      const questionToTopic = new Map<string, string>();
      questions.forEach(q => questionToTopic.set(q.id, q.topic_id));

      // Count answers per topic from the answers we fetched
      const topicAnswerCounts = new Map<string, number>();
      (answersByTopicResult.data || []).forEach(a => {
        const topicId = questionToTopic.get(a.question_id);
        if (topicId) {
          topicAnswerCounts.set(topicId, (topicAnswerCounts.get(topicId) || 0) + 1);
        }
      });

      // Calculate per-topic coverage
      const topicCoverage: TopicCoverage[] = topics.map(topic => {
        const topicQuestions = questions.filter(q => q.topic_id === topic.id);
        const totalPotentialForTopic = totalCandidates * topicQuestions.length;
        const totalActualForTopic = topicAnswerCounts.get(topic.id) || 0;

        return {
          topicId: topic.id,
          topicName: topic.name,
          icon: topic.icon,
          totalQuestions: topicQuestions.length,
          totalCandidates,
          totalPotentialAnswers: totalPotentialForTopic,
          totalActualAnswers: totalActualForTopic,
          coveragePercent: totalPotentialForTopic > 0 
            ? Math.round((totalActualForTopic / totalPotentialForTopic) * 1000) / 10
            : 0,
        };
      }).sort((a, b) => b.coveragePercent - a.coveragePercent);

      // Skip per-candidate coverage calculation (expensive) - return empty array
      // The AnswerCoveragePanel already fetches this data separately with useCandidatesAnswerCoverage
      const candidateCoverage: CandidateCoverage[] = [];

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
    staleTime: 1000 * 60 * 2, // 2 minutes (increased from 1)
    refetchInterval: 1000 * 60 * 10, // Auto-refresh every 10 minutes (increased from 5)
  });
}
