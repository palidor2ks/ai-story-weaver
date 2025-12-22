import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InvertedScoreCandidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  calculated_score: number;
  answer_count: number;
  saved_score: number | null;
  status: 'INVERTED' | 'OK';
}

/**
 * Fetches candidates whose scores appear to be inverted:
 * - Democrats/Independents with positive average scores (should be negative)
 * - Republicans with negative average scores (should be positive)
 */
export const useInvertedScoreCandidates = () => {
  return useQuery({
    queryKey: ['inverted-score-candidates'],
    queryFn: async (): Promise<InvertedScoreCandidate[]> => {
      // Get all candidate answers with candidate info
      const { data: answers, error: answersError } = await supabase
        .from('candidate_answers')
        .select('candidate_id, answer_value');
      
      if (answersError) throw answersError;

      // Get candidate info
      const { data: candidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('id, name, party, office, state, overall_score');
      
      if (candidatesError) throw candidatesError;

      // Create a map of candidate info
      const candidateMap = new Map(candidates?.map(c => [c.id, c]) || []);

      // Group answers by candidate and calculate scores
      const scoresByCandidate = new Map<string, number[]>();
      answers?.forEach(a => {
        const existing = scoresByCandidate.get(a.candidate_id) || [];
        existing.push(a.answer_value);
        scoresByCandidate.set(a.candidate_id, existing);
      });

      // Find inverted candidates
      const inverted: InvertedScoreCandidate[] = [];
      
      scoresByCandidate.forEach((values, candidateId) => {
        const candidate = candidateMap.get(candidateId);
        if (!candidate) return;

        const avgScore = values.reduce((a, b) => a + b, 0) / values.length;
        const roundedScore = Math.round(avgScore * 100) / 100;

        const isInverted = 
          ((['Democrat', 'Independent'].includes(candidate.party)) && roundedScore > 0) ||
          (candidate.party === 'Republican' && roundedScore < 0);

        if (isInverted) {
          inverted.push({
            candidate_id: candidateId,
            name: candidate.name,
            party: candidate.party,
            office: candidate.office,
            state: candidate.state,
            calculated_score: roundedScore,
            answer_count: values.length,
            saved_score: candidate.overall_score,
            status: 'INVERTED',
          });
        }
      });

      // Sort by absolute score (most inverted first)
      return inverted.sort((a, b) => Math.abs(b.calculated_score) - Math.abs(a.calculated_score));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to regenerate answers for a candidate with correct scoring
 */
export const useRegenerateCandidateAnswers = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error } = await supabase.functions.invoke('get-candidate-answers', {
        body: { 
          candidateId, 
          forceRegenerate: true 
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, candidateId) => {
      toast.success(`Regenerated ${data.generated || data.count} answers with corrected scoring`);
      queryClient.invalidateQueries({ queryKey: ['inverted-score-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-answers', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-score-map'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to regenerate answers: ${error.message}`);
    },
  });
};

/**
 * Hook to batch regenerate answers for multiple candidates
 */
export const useBatchRegenerateCandidates = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidateIds: string[]) => {
      const results = [];
      
      for (const candidateId of candidateIds) {
        try {
          const { data, error } = await supabase.functions.invoke('get-candidate-answers', {
            body: { 
              candidateId, 
              forceRegenerate: true 
            },
          });
          
          if (error) {
            console.error(`Error regenerating ${candidateId}:`, error);
            results.push({ candidateId, success: false, error });
          } else {
            results.push({ candidateId, success: true, data });
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          console.error(`Error regenerating ${candidateId}:`, e);
          results.push({ candidateId, success: false, error: e });
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      toast.success(`Regenerated answers for ${successCount}/${results.length} candidates`);
      queryClient.invalidateQueries({ queryKey: ['inverted-score-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-answers'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-score-map'] });
    },
    onError: (error: Error) => {
      toast.error(`Batch regeneration failed: ${error.message}`);
    },
  });
};
