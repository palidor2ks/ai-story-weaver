import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useRef } from 'react';
import { calculateMatchPercentage, calculateEntityScore } from '@/lib/scoring';

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

interface ScoreResult {
  score: number;
  overallScore: number;
  answerCount: number;
  generated: boolean;
}

/**
 * Hook to fetch or generate answers for a list of representatives
 * and calculate match scores against user's answers
 */
export const useRepresentativeAnswersAndScores = (
  representatives: RepresentativeInfo[],
  userAnswers: QuizAnswer[]
) => {
  // Track whether we've already generated answers this session
  const hasGeneratedRef = useRef<Set<string>>(new Set());
  
  // Only run query when we have both reps and answers
  const hasData = representatives.length > 0 && userAnswers.length > 0;
  
  // Create stable query keys by sorting
  const repIds = [...representatives.map(r => r.id)].sort().join(',');
  const questionIds = [...userAnswers.map(a => a.question_id)].sort().join(',');

  return useQuery({
    queryKey: ['rep-answers-scores', repIds, questionIds],
    queryFn: async () => {
      if (!hasData) {
        return { scores: {} as Record<string, ScoreResult>, answersGenerated: 0 };
      }

      const scores: Record<string, ScoreResult> = {};
      let totalGenerated = 0;

      // First, check what answers already exist in the database for ALL reps at once
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

      // Identify which reps need AI generation (have < 30% coverage and haven't been generated this session)
      const repsNeedingGeneration: RepresentativeInfo[] = [];
      const neededQuestions = userAnswers.map(a => a.question_id);

      for (const rep of representatives) {
        const repAnswers = answersByCandidate[rep.id] || [];
        
        // If we have enough answers, calculate score immediately
        if (repAnswers.length >= neededQuestions.length * 0.3) {
          const { matchScore, overallScore } = calculateScores(userAnswers, repAnswers);
          scores[rep.id] = { 
            score: matchScore, 
            overallScore,
            answerCount: repAnswers.length,
            generated: false 
          };
        } else if (!hasGeneratedRef.current.has(rep.id)) {
          // Only queue for generation if we haven't tried this session
          repsNeedingGeneration.push(rep);
        } else {
          // Already tried generating, use whatever we have
          if (repAnswers.length > 0) {
            const { matchScore, overallScore } = calculateScores(userAnswers, repAnswers);
            scores[rep.id] = { 
              score: matchScore, 
              overallScore,
              answerCount: repAnswers.length,
              generated: false 
            };
          }
        }
      }

      // Generate answers for reps that need it (in parallel, but limited batch)
      const BATCH_SIZE = 3; // Limit concurrent requests
      for (let i = 0; i < repsNeedingGeneration.length; i += BATCH_SIZE) {
        const batch = repsNeedingGeneration.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (rep) => {
            // Mark as attempted to prevent re-triggering
            hasGeneratedRef.current.add(rep.id);
            
            console.log(`Fetching/generating answers for ${rep.name} (${rep.id})...`);
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
              return { rep, data: null, error };
            }

            return { rep, data, error: null };
          })
        );

        // Process results
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.data) {
            const { rep, data } = result.value;
            const generatedCount = data?.generated || 0;
            totalGenerated += generatedCount;
            
            const allAnswers = data?.answers || [];
            if (allAnswers.length > 0) {
              const { matchScore, overallScore } = calculateScores(userAnswers, allAnswers);
              scores[rep.id] = { 
                score: matchScore, 
                overallScore,
                answerCount: allAnswers.length,
                generated: generatedCount > 0 
              };
            }
          }
        }
      }

      return { scores, answersGenerated: totalGenerated };
    },
    enabled: hasData,
    staleTime: 1000 * 60 * 30, // 30 minutes - much longer cache
    gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when component mounts
    refetchOnReconnect: false,
  });
};

/**
 * Calculate both match score and overall political score from answers.
 * Uses unified scoring utilities for consistency.
 */
function calculateScores(
  userAnswers: QuizAnswer[],
  candidateAnswers: { question_id: string; answer_value: number }[]
): { matchScore: number; overallScore: number } {
  const candidateMap = new Map(
    candidateAnswers.map(a => [a.question_id, a.answer_value])
  );

  // Calculate average user score and candidate score for matched questions
  let userTotal = 0;
  let candidateTotal = 0;
  let sharedCount = 0;

  for (const userAnswer of userAnswers) {
    const candidateValue = candidateMap.get(userAnswer.question_id);
    if (candidateValue !== undefined) {
      userTotal += userAnswer.value;
      candidateTotal += candidateValue;
      sharedCount++;
    }
  }

  if (sharedCount === 0) {
    return { matchScore: 0, overallScore: 0 };
  }

  // Calculate scores using unified utilities
  const userAvg = userTotal / sharedCount;
  const candidateAvg = candidateTotal / sharedCount;
  
  const matchScore = calculateMatchPercentage(userAvg, candidateAvg);
  const overallScore = Math.round(candidateAvg * 100) / 100;

  return { matchScore, overallScore };
}

/**
 * Calculate overall political score for a representative based on their answers.
 * Returns a score from -10 to +10.
 */
export function calculateOverallScoreFromAnswers(
  answers: { answer_value: number }[]
): number {
  const score = calculateEntityScore(
    answers.map(a => ({ question_id: '', answer_value: a.answer_value }))
  );
  return score ?? 0;
}
