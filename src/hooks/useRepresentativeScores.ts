import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

interface QuizAnswer {
  question_id: string;
  value: number;
}

interface CandidateAnswerWithScore {
  candidate_id: string;
  question_id: string;
  answer_value: number;
}

/**
 * Hook to get user's quiz answer question IDs
 */
export const useUserQuizQuestionIds = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-quiz-question-ids', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('quiz_answers')
        .select('question_id, value')
        .eq('user_id', user.id);

      if (error) throw error;
      return data as QuizAnswer[];
    },
    enabled: !!user,
  });
};

interface RepresentativeInfo {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
}

/**
 * Hook to fetch or generate answers for a list of representatives
 * and calculate match scores against user's answers
 */
export const useRepresentativeAnswersAndScores = (
  representatives: RepresentativeInfo[],
  userAnswers: QuizAnswer[]
) => {
  // Only run query when we have both reps and answers
  const hasData = representatives.length > 0 && userAnswers.length > 0;
  const repIds = representatives.map(r => r.id).sort();
  const questionIds = userAnswers.map(a => a.question_id).sort();

  return useQuery({
    queryKey: ['rep-answers-scores', repIds, questionIds],
    queryFn: async () => {
      if (!hasData) {
        return { scores: {}, answersGenerated: 0 };
      }

      const scores: Record<string, { score: number; answerCount: number; generated: boolean }> = {};
      let totalGenerated = 0;

      // First, check what answers already exist in the database
      const { data: existingAnswers, error: fetchError } = await supabase
        .from('candidate_answers')
        .select('candidate_id, question_id, answer_value')
        .in('candidate_id', representatives.map(r => r.id))
        .in('question_id', userAnswers.map(a => a.question_id));

      if (fetchError) {
        console.error('Error fetching existing answers:', fetchError);
      }

      // Group existing answers by candidate
      const answersByCandidate: Record<string, CandidateAnswerWithScore[]> = {};
      (existingAnswers || []).forEach(answer => {
        if (!answersByCandidate[answer.candidate_id]) {
          answersByCandidate[answer.candidate_id] = [];
        }
        answersByCandidate[answer.candidate_id].push(answer);
      });

      // For each representative, calculate score or trigger generation
      for (const rep of representatives) {
        const repAnswers = answersByCandidate[rep.id] || [];
        
        // If we have at least 30% of answers, calculate score from existing
        const neededQuestions = userAnswers.map(a => a.question_id);
        if (repAnswers.length >= neededQuestions.length * 0.3) {
          const score = calculateMatchScore(userAnswers, repAnswers);
          scores[rep.id] = { 
            score, 
            answerCount: repAnswers.length,
            generated: false 
          };
        } else {
          // Trigger AI generation for this rep - pass candidate info
          try {
            console.log(`Triggering AI generation for rep ${rep.name} (${rep.id})...`);
            const { data, error } = await supabase.functions.invoke(
              'get-candidate-answers',
              {
                body: {
                  candidateId: rep.id,
                  questionIds: userAnswers.map(a => a.question_id),
                  candidateName: rep.name,
                  candidateParty: rep.party,
                  candidateOffice: rep.office,
                  candidateState: rep.state,
                },
              }
            );

            if (error) {
              console.error(`Error generating answers for ${rep.name}:`, error);
              // Use whatever we have
              if (repAnswers.length > 0) {
                const score = calculateMatchScore(userAnswers, repAnswers);
                scores[rep.id] = { score, answerCount: repAnswers.length, generated: false };
              }
            } else {
              totalGenerated += data?.generated || 0;
              const allAnswers = data?.answers || [];
              
              // Calculate score from generated answers
              if (allAnswers.length > 0) {
                const score = calculateMatchScore(userAnswers, allAnswers);
                scores[rep.id] = { 
                  score, 
                  answerCount: allAnswers.length,
                  generated: (data?.generated || 0) > 0 
                };
              }
            }
          } catch (e) {
            console.error(`Failed to generate answers for ${rep.name}:`, e);
          }
        }
      }

      return { scores, answersGenerated: totalGenerated };
    },
    enabled: hasData,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
};

/**
 * Calculate match score between user answers and candidate answers
 * Returns a percentage (0-100)
 */
function calculateMatchScore(
  userAnswers: QuizAnswer[],
  candidateAnswers: { question_id: string; answer_value: number }[]
): number {
  const candidateMap = new Map(
    candidateAnswers.map(a => [a.question_id, a.answer_value])
  );

  let totalDifference = 0;
  let sharedCount = 0;

  for (const userAnswer of userAnswers) {
    const candidateValue = candidateMap.get(userAnswer.question_id);
    if (candidateValue !== undefined) {
      // Difference between user and candidate on -10 to +10 scale
      const difference = Math.abs(userAnswer.value - candidateValue);
      totalDifference += difference;
      sharedCount++;
    }
  }

  if (sharedCount === 0) return 0;

  // Max possible difference is 20 per question (-10 to +10)
  const maxDifference = sharedCount * 20;
  const matchPercentage = ((maxDifference - totalDifference) / maxDifference) * 100;
  
  return Math.round(matchPercentage);
}

/**
 * Calculate overall political score for a representative based on their answers
 * Returns a score from -10 to +10
 */
export function calculateOverallScoreFromAnswers(
  answers: { answer_value: number }[]
): number {
  if (answers.length === 0) return 0;
  
  const total = answers.reduce((sum, a) => sum + a.answer_value, 0);
  return Math.round((total / answers.length) * 10) / 10;
}
