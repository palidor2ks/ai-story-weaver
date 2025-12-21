import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CandidateAnswer {
  id: string;
  candidate_id: string;
  question_id: string;
  answer_value: number;
  source_url: string | null;
  source_description: string | null;
  source_type: 'voting_record' | 'public_statement' | 'campaign_website' | 'interview' | 'legislation' | 'other';
  confidence: 'high' | 'medium' | 'low';
  created_at: string;
  updated_at: string;
  // Joined data
  question?: {
    id: string;
    text: string;
    topic_id: string;
    topics?: {
      id: string;
      name: string;
    };
  };
}

// Fetch all answers for a specific candidate
export const useCandidateAnswers = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['candidate-answers', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      const { data, error } = await supabase
        .from('candidate_answers')
        .select(`
          *,
          question:questions (
            id,
            text,
            topic_id,
            topics (
              id,
              name
            )
          )
        `)
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching candidate answers:', error);
        throw error;
      }
      
      return data as CandidateAnswer[];
    },
    enabled: !!candidateId,
  });
};

// Fetch answers for a specific candidate on questions the user has also answered
export const useCandidateAnswersForUser = (
  candidateId: string | undefined, 
  userQuestionIds: string[]
) => {
  return useQuery({
    queryKey: ['candidate-answers-for-user', candidateId, userQuestionIds],
    queryFn: async () => {
      if (!candidateId || userQuestionIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('candidate_answers')
        .select(`
          *,
          question:questions (
            id,
            text,
            topic_id,
            topics (
              id,
              name
            )
          )
        `)
        .eq('candidate_id', candidateId)
        .in('question_id', userQuestionIds);
      
      if (error) {
        console.error('Error fetching candidate answers for user:', error);
        throw error;
      }
      
      return data as CandidateAnswer[];
    },
    enabled: !!candidateId && userQuestionIds.length > 0,
  });
};

// Calculate match score between user and candidate based on shared answered questions
export const calculateDetailedMatchScore = (
  userAnswers: { question_id: string; value: number }[],
  candidateAnswers: CandidateAnswer[]
): {
  matchScore: number;
  sharedQuestions: number;
  agreements: { questionId: string; userValue: number; candidateValue: number; difference: number }[];
  disagreements: { questionId: string; userValue: number; candidateValue: number; difference: number }[];
} => {
  const candidateAnswerMap = new Map(
    candidateAnswers.map(a => [a.question_id, a.answer_value])
  );
  
  const sharedQuestions: { questionId: string; userValue: number; candidateValue: number; difference: number }[] = [];
  
  // Find questions both have answered
  for (const userAnswer of userAnswers) {
    const candidateValue = candidateAnswerMap.get(userAnswer.question_id);
    if (candidateValue !== undefined) {
      const difference = Math.abs(userAnswer.value - candidateValue);
      sharedQuestions.push({
        questionId: userAnswer.question_id,
        userValue: userAnswer.value,
        candidateValue,
        difference,
      });
    }
  }
  
  if (sharedQuestions.length === 0) {
    return { matchScore: 0, sharedQuestions: 0, agreements: [], disagreements: [] };
  }
  
  // Calculate match score based on shared questions
  // Max difference per question is 20 (-10 to +10)
  const maxPossibleDifference = sharedQuestions.length * 20;
  const totalDifference = sharedQuestions.reduce((sum, q) => sum + q.difference, 0);
  const matchScore = Math.round(((maxPossibleDifference - totalDifference) / maxPossibleDifference) * 100);
  
  // Separate into agreements and disagreements
  // Agreement = same sign (both positive or both negative) and difference <= 6
  const agreements = sharedQuestions.filter(q => 
    (q.userValue * q.candidateValue > 0) || // Same sign
    (Math.abs(q.userValue) <= 2 && Math.abs(q.candidateValue) <= 2) // Both moderate
  );
  
  const disagreements = sharedQuestions.filter(q => 
    q.userValue * q.candidateValue < 0 && // Opposite signs
    Math.abs(q.userValue) > 2 && Math.abs(q.candidateValue) > 2 // Both have strong positions
  );
  
  return {
    matchScore,
    sharedQuestions: sharedQuestions.length,
    agreements: agreements.sort((a, b) => a.difference - b.difference),
    disagreements: disagreements.sort((a, b) => b.difference - a.difference),
  };
};

// Calculate overall score for a candidate based on ALL their answers (for party comparison)
export const calculateOverallCandidateScore = (candidateAnswers: CandidateAnswer[]): number => {
  if (candidateAnswers.length === 0) return 0;
  
  const totalValue = candidateAnswers.reduce((sum, a) => sum + a.answer_value, 0);
  return totalValue / candidateAnswers.length;
};

// Get source type label
export const getSourceTypeLabel = (sourceType: CandidateAnswer['source_type']): string => {
  switch (sourceType) {
    case 'voting_record': return 'Voting Record';
    case 'public_statement': return 'Public Statement';
    case 'campaign_website': return 'Campaign Website';
    case 'interview': return 'Interview';
    case 'legislation': return 'Legislation';
    case 'other': return 'Other Source';
    default: return 'Unknown';
  }
};
