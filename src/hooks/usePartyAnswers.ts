import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PartyAnswerComparison {
  question_id: string;
  value: number;
  source_url: string | null;
  source_description: string | null;
  question_text: string;
  topic_name: string;
}

// A party's answers joined with question/topic text, for the party comparison card.
export function usePartyAnswers(partyId: string) {
  return useQuery({
    queryKey: ['party-answers-with-questions', partyId],
    queryFn: async (): Promise<PartyAnswerComparison[]> => {
      const { data, error } = await supabase
        .from('party_answers')
        .select(`
          question_id,
          answer_value,
          source_url,
          source_description,
          questions!inner (
            text,
            topics!inner (name)
          )
        `)
        .eq('party_id', partyId);

      if (error) {
        console.error('Error fetching party answers:', error);
        return [];
      }

      return (data as unknown as Array<{
        question_id: string;
        answer_value: number;
        source_url: string | null;
        source_description: string | null;
        questions: { text: string; topics: { name: string } };
      }>).map((a) => ({
        question_id: a.question_id,
        value: a.answer_value,
        source_url: a.source_url,
        source_description: a.source_description,
        question_text: a.questions.text,
        topic_name: a.questions.topics.name,
      }));
    },
    enabled: !!partyId,
    staleTime: 1000 * 60 * 10,
  });
}
