import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateEntityScore } from '@/lib/scoring';

/**
 * Source of truth for political scores across the app.
 * All scores are on the -10 to +10 scale.
 *
 * Priority order:
 * 1. `candidate_overrides.overall_score` (manual overrides)
 * 2. `candidates.overall_score` (pre-saved scores)
 * 3. Calculated from `candidate_answers` (dynamic fallback for missing scores)
 */
export const useCandidateScoreMap = (candidateIds?: string[]) => {
  const ids = (candidateIds ?? []).filter(Boolean);
  const hasFilter = ids.length > 0;
  const idsKey = hasFilter ? [...ids].sort().join(',') : 'all';

  return useQuery({
    queryKey: ['candidate-score-map', idsKey],
    queryFn: async () => {
      // Fetch saved scores from candidates and overrides tables
      let overridesQuery = supabase
        .from('candidate_overrides')
        .select('candidate_id, overall_score');

      let candidatesQuery = supabase
        .from('candidates')
        .select('id, overall_score');

      if (hasFilter) {
        overridesQuery = overridesQuery.in('candidate_id', ids);
        candidatesQuery = candidatesQuery.in('id', ids);
      }

      const [{ data: overrides, error: overridesError }, { data: candidates, error: candidatesError }] =
        await Promise.all([overridesQuery, candidatesQuery]);

      if (candidatesError) throw candidatesError;
      if (overridesError) {
        console.error('Error fetching candidate_overrides scores:', overridesError);
      }

      const map = new Map<string, number>();

      // First pass: add scores from candidates table
      (candidates || []).forEach((c) => {
        if (c.overall_score !== null && c.overall_score !== 0) {
          map.set(c.id, c.overall_score);
        }
      });

      // Second pass: overrides take precedence
      (overrides || []).forEach((o) => {
        if (o.overall_score !== null && o.overall_score !== 0) {
          map.set(o.candidate_id, o.overall_score);
        }
      });

      // Identify candidates with missing scores that we need to calculate
      const candidatesWithMissingScores = ids.filter(id => !map.has(id));

      if (candidatesWithMissingScores.length > 0) {
        // Fetch answers from candidate_answers and calculate scores dynamically
        const { data: answers, error: answersError } = await supabase
          .from('candidate_answers')
          .select('candidate_id, question_id, answer_value')
          .in('candidate_id', candidatesWithMissingScores);

        if (answersError) {
          console.error('Error fetching candidate_answers for score calculation:', answersError);
        } else if (answers && answers.length > 0) {
          // Group answers by candidate
          const answersByCandidate = new Map<string, Array<{ question_id: string; answer_value: number }>>();
          
          answers.forEach((a) => {
            const existing = answersByCandidate.get(a.candidate_id) || [];
            existing.push({ question_id: a.question_id, answer_value: a.answer_value });
            answersByCandidate.set(a.candidate_id, existing);
          });

          // Calculate scores using unified scoring utility
          answersByCandidate.forEach((candidateAnswers, candidateId) => {
            const score = calculateEntityScore(candidateAnswers);
            if (score !== null) {
              map.set(candidateId, score);
            }
          });

          console.log(`Calculated scores from candidate_answers for ${answersByCandidate.size} candidates`);
        }
      }

      return map;
    },
    staleTime: 1000 * 60 * 2,
  });
};
