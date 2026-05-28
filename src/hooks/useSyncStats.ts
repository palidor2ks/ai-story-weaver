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
  // FEC summary stats
  fecStats: {
    withFecId: number;
    neverSynced: number;
    partial: number;
    complete: number;
  };
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
        topicAnswerCountsResult,
        // FEC stats queries
        fecCandidatesResult,
        committeesResult
      ] = await Promise.all([
        // Get candidate count and basic info
        supabase
          .from('candidates')
          .select('id, name, party, last_answers_sync'),
        // Get questions with topic IDs
        supabase
          .from('questions')
          .select('id, topic_id'),
        // Get all federal topics
        supabase
          .from('topics')
          .select('id, name, icon')
          .eq('scope', 'all'),
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
        // Get answer counts grouped by topic using aggregated view (single query instead of 85k rows)
        supabase
          .from('topic_answer_counts')
          .select('topic_id, answer_count'),
        // FEC: Get candidates with FEC IDs and donor sync info
        supabase
          .from('candidates')
          .select('id, fec_candidate_id, last_donor_sync'),
        // FEC: Get committees with sync status
        supabase
          .from('candidate_committees')
          .select('candidate_id, has_more')
      ]);

      if (candidatesResult.error) throw candidatesResult.error;
      if (questionsResult.error) throw questionsResult.error;
      if (topicsResult.error) throw topicsResult.error;

      const candidates = candidatesResult.data || [];
      const topics = topicsResult.data || [];
      // Filter questions to only federal topics
      const federalTopicIds = new Set(topics.map(t => t.id));
      const questions = (questionsResult.data || []).filter(q => federalTopicIds.has(q.topic_id));

      // Build topic answer counts map from aggregated view
      const topicAnswerCounts = new Map<string, number>();
      (topicAnswerCountsResult.data || []).forEach(row => {
        if (row.topic_id) {
          topicAnswerCounts.set(row.topic_id, Number(row.answer_count) || 0);
        }
      });

      // Sum only federal-scope answers so the numerator matches the federal-scope denominator
      const totalActualAnswers = Array.from(topicAnswerCounts.entries())
        .filter(([topicId]) => federalTopicIds.has(topicId))
        .reduce((sum, [, count]) => sum + count, 0);

      const totalCandidates = candidates.length;
      const totalQuestions = questions.length;
      const totalPotentialAnswers = totalCandidates * totalQuestions;
      const overallCoveragePercent = totalPotentialAnswers > 0 
        ? Math.round((totalActualAnswers / totalPotentialAnswers) * 1000) / 10
        : 0;

      // Get last sync time
      const lastSyncTime = lastSyncResult.data?.[0]?.last_answers_sync || null;


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

      // Calculate FEC sync stats
      const fecCandidates = fecCandidatesResult.data || [];
      const committees = committeesResult.data || [];
      
      // Build a map of candidate_id to their committee statuses
      const candidateCommitteeStatus = new Map<string, { hasMore: boolean }>();
      committees.forEach(c => {
        if (c.candidate_id) {
          const existing = candidateCommitteeStatus.get(c.candidate_id);
          // If any committee has_more = true, the candidate is "partial"
          if (!existing || c.has_more) {
            candidateCommitteeStatus.set(c.candidate_id, { hasMore: c.has_more || false });
          }
        }
      });

      const withFecId = fecCandidates.filter(c => !!c.fec_candidate_id).length;
      const neverSynced = fecCandidates.filter(c => 
        c.fec_candidate_id && !c.last_donor_sync
      ).length;
      const partial = fecCandidates.filter(c => {
        if (!c.fec_candidate_id) return false;
        const status = candidateCommitteeStatus.get(c.id);
        return status?.hasMore === true;
      }).length;
      const complete = fecCandidates.filter(c => {
        if (!c.fec_candidate_id || !c.last_donor_sync) return false;
        const status = candidateCommitteeStatus.get(c.id);
        return status && status.hasMore === false;
      }).length;

      return {
        totalCandidates,
        totalQuestions,
        totalPotentialAnswers,
        totalActualAnswers,
        overallCoveragePercent,
        lastSyncTime,
        candidateCoverage,
        topicCoverage,
        fecStats: {
          withFecId,
          neverSynced,
          partial,
          complete,
        },
      };
    },
    staleTime: 1000 * 60 * 30, // 30 minutes (prevent frequent refetches)
    refetchInterval: false, // Disable auto-refresh - use manual refresh only
  });
}
