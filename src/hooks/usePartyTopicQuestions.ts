import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PartyQuestionAnswer {
  questionId: string;
  questionText: string;
  answerValue: number | null;
  confidence: string | null;
  sourceDescription: string | null;
  sourceUrls: string[] | null;
  sourceTitles: string[] | null;
  hasSource: boolean;
  evidenceType: string | null;
}

export function usePartyTopicQuestions(partyId: string, topicId: string, enabled = false) {
  return useQuery({
    queryKey: ['party-topic-questions', partyId, topicId],
    queryFn: async (): Promise<PartyQuestionAnswer[]> => {
      // Fetch questions for topic
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, text')
        .eq('topic_id', topicId)
        .order('text');

      if (questionsError) throw questionsError;

      // Fetch party answers for these questions
      const questionIds = questions.map(q => q.id);
      const { data: answers, error: answersError } = await supabase
        .from('party_answers')
        .select('question_id, answer_value, confidence, source_description, source_url, source_urls, source_titles, evidence_type')
        .eq('party_id', partyId)
        .in('question_id', questionIds);

      if (answersError) throw answersError;

      // Create a map of answers by question_id
      const answerMap = new Map(answers?.map(a => [a.question_id, a]) || []);

      // Combine questions with their answers
      return questions.map(q => {
        const answer = answerMap.get(q.id);
        // Combine source_urls array with legacy source_url field
        const sourceUrls = answer?.source_urls || (answer?.source_url ? [answer.source_url] : null);
        const sourceTitles = answer?.source_titles || null;
        return {
          questionId: q.id,
          questionText: q.text,
          answerValue: answer?.answer_value ?? null,
          confidence: answer?.confidence ?? null,
          sourceDescription: answer?.source_description ?? null,
          sourceUrls,
          sourceTitles,
          hasSource: !!(answer?.source_description || answer?.source_url || (answer?.source_urls?.length ?? 0) > 0),
          evidenceType: answer?.evidence_type ?? null,
        };
      });
    },
    enabled,
    staleTime: 30000,
  });
}
