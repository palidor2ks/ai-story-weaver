import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CandidateQuestionAnswer {
  questionId: string;
  questionText: string;
  topicId: string;
  answerValue: number | null;
  confidence: string | null;
  sourceDescription: string | null;
  hasSource: boolean;
}

export function useCandidateTopicQuestions(
  candidateId: string,
  topicId: string,
  enabled = false
) {
  return useQuery({
    queryKey: ['candidate-topic-questions', candidateId, topicId],
    queryFn: async (): Promise<CandidateQuestionAnswer[]> => {
      // Fetch questions for the topic
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, text, topic_id')
        .eq('topic_id', topicId);

      if (questionsError) throw questionsError;
      if (!questions || questions.length === 0) return [];

      // Fetch candidate answers for these questions
      const questionIds = questions.map(q => q.id);
      const { data: answers, error: answersError } = await supabase
        .from('candidate_answers')
        .select('question_id, answer_value, confidence, source_description')
        .eq('candidate_id', candidateId)
        .in('question_id', questionIds);

      if (answersError) throw answersError;

      // Create a map of answers by question_id
      const answerMap = new Map(
        (answers || []).map(a => [a.question_id, a])
      );

      // Combine questions with their answers
      return questions.map(q => {
        const answer = answerMap.get(q.id);
        const sourceDesc = answer?.source_description || '';
        const hasSource = sourceDesc.length > 0 && 
          !sourceDesc.toLowerCase().includes('no documented');
        
        return {
          questionId: q.id,
          questionText: q.text,
          topicId: q.topic_id,
          answerValue: answer?.answer_value ?? null,
          confidence: answer?.confidence ?? null,
          sourceDescription: answer?.source_description ?? null,
          hasSource,
        };
      });
    },
    enabled: enabled && !!candidateId && !!topicId,
    staleTime: 30000,
  });
}
