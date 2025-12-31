import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TopicStats {
  topicId: string;
  topicName: string;
  answerCount: number;
  totalQuestions: number;
  percentage: number;
  sourcedCount: number;
  sourcePercentage: number;
}

interface PartyTopicStats {
  partyId: string;
  partyName: string;
  topics: TopicStats[];
  totalAnswers: number;
  totalQuestions: number;
  overallPercentage: number;
  totalSourced: number;
  overallSourcePercentage: number;
}

const PARTIES = [
  { id: 'democrat', name: 'Democratic Party' },
  { id: 'republican', name: 'Republican Party' },
  { id: 'green', name: 'Green Party' },
  { id: 'libertarian', name: 'Libertarian Party' },
];

export function usePartyAnswerStatsByTopic() {
  return useQuery({
    queryKey: ['party-answer-stats-by-topic'],
    queryFn: async (): Promise<PartyTopicStats[]> => {
      // Get all topics
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name')
        .order('name');

      if (topicsError) throw topicsError;

      // Get questions with their topic_id
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, topic_id');

      if (questionsError) throw questionsError;

      // Get all party answers with source info
      const { data: answers, error: answersError } = await supabase
        .from('party_answers')
        .select('party_id, question_id, source_description');

      if (answersError) throw answersError;

      // Helper to check if answer has a valid source
      const hasValidSource = (desc: string | null) => 
        desc && !desc.toLowerCase().includes('no documented position');

      // Create lookup: question_id -> topic_id
      const questionToTopic: Record<string, string> = {};
      questions?.forEach(q => {
        questionToTopic[q.id] = q.topic_id;
      });

      // Count questions per topic
      const questionsPerTopic: Record<string, number> = {};
      questions?.forEach(q => {
        questionsPerTopic[q.topic_id] = (questionsPerTopic[q.topic_id] || 0) + 1;
      });

      // Count answers and sourced answers per party per topic
      const answersPerPartyTopic: Record<string, Record<string, number>> = {};
      const sourcedPerPartyTopic: Record<string, Record<string, number>> = {};
      
      answers?.forEach(a => {
        const topicId = questionToTopic[a.question_id];
        if (!topicId) return;
        
        if (!answersPerPartyTopic[a.party_id]) {
          answersPerPartyTopic[a.party_id] = {};
          sourcedPerPartyTopic[a.party_id] = {};
        }
        answersPerPartyTopic[a.party_id][topicId] = 
          (answersPerPartyTopic[a.party_id][topicId] || 0) + 1;
        
        if (hasValidSource(a.source_description)) {
          sourcedPerPartyTopic[a.party_id][topicId] = 
            (sourcedPerPartyTopic[a.party_id][topicId] || 0) + 1;
        }
      });

      const totalQuestions = questions?.length || 0;

      // Build stats for each party
      return PARTIES.map(party => {
        const partyTopics: TopicStats[] = (topics || []).map(topic => {
          const total = questionsPerTopic[topic.id] || 0;
          const answered = answersPerPartyTopic[party.id]?.[topic.id] || 0;
          const sourced = sourcedPerPartyTopic[party.id]?.[topic.id] || 0;
          return {
            topicId: topic.id,
            topicName: topic.name,
            answerCount: answered,
            totalQuestions: total,
            percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
            sourcedCount: sourced,
            sourcePercentage: answered > 0 ? Math.round((sourced / answered) * 100) : 0,
          };
        });

        const totalAnswers = partyTopics.reduce((sum, t) => sum + t.answerCount, 0);
        const totalSourced = partyTopics.reduce((sum, t) => sum + t.sourcedCount, 0);

        return {
          partyId: party.id,
          partyName: party.name,
          topics: partyTopics,
          totalAnswers,
          totalQuestions,
          overallPercentage: totalQuestions > 0 
            ? Math.round((totalAnswers / totalQuestions) * 100) 
            : 0,
          totalSourced,
          overallSourcePercentage: totalAnswers > 0
            ? Math.round((totalSourced / totalAnswers) * 100)
            : 0,
        };
      });
    },
    staleTime: 30000,
  });
}
