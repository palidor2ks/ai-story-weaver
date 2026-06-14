import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopicScore {
  topicId: string;
  topicName: string;
  score: number;
}

interface RawTopicScoreRow {
  topic_id: string;
  score: number;
  topics: { name: string } | null;
}

export function useAllCandidateTopicScores(
  candidateId: string | null | undefined,
  enabled = true,
) {
  return useQuery<TopicScore[]>({
    queryKey: ['all-topic-scores', candidateId],
    enabled: !!candidateId && enabled,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_topic_scores')
        .select('topic_id, score, topics(name)')
        .eq('candidate_id', candidateId!);
      if (error) throw error;
      return (data ?? [])
        .map((r) => {
          const row = r as unknown as RawTopicScoreRow;
          return {
            topicId: row.topic_id,
            topicName: row.topics?.name ?? row.topic_id,
            score: Number(row.score),
          };
        })
        .filter((t) => Number.isFinite(t.score))
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    },
  });
}
