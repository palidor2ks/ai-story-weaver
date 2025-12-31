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
  source: 'candidates' | 'static_officials';
}

/**
 * Fetches candidates whose scores appear to be inverted:
 * - Democrats/Independents with positive average scores (should be negative)
 * - Republicans with negative average scores (should be positive)
 * 
 * Now includes both candidates table AND static_officials (for federal executives)
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

      // Get candidate info from candidates table
      const { data: candidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('id, name, party, office, state, overall_score');
      
      if (candidatesError) throw candidatesError;

      // Get static officials (includes federal_president, federal_vice_president)
      const { data: staticOfficials, error: staticError } = await supabase
        .from('static_officials')
        .select('id, name, party, office, state')
        .eq('is_active', true);
      
      if (staticError) throw staticError;

      // Get candidate_overrides for saved scores (used for static officials)
      const { data: overrides, error: overridesError } = await supabase
        .from('candidate_overrides')
        .select('candidate_id, overall_score');
      
      if (overridesError) throw overridesError;

      // Create maps for quick lookups
      const candidateMap = new Map(candidates?.map(c => [c.id, { ...c, source: 'candidates' as const }]) || []);
      const staticMap = new Map(staticOfficials?.map(s => [s.id, { ...s, overall_score: null, source: 'static_officials' as const }]) || []);
      const overrideMap = new Map(overrides?.map(o => [o.candidate_id, o.overall_score]) || []);

      // Merge all officials into a single map (static_officials takes precedence for federal IDs)
      const allOfficialsMap = new Map<string, { id: string; name: string; party: string; office: string; state: string; overall_score: number | null; source: 'candidates' | 'static_officials' }>();
      
      // Add candidates first
      candidateMap.forEach((c, id) => allOfficialsMap.set(id, c));
      
      // Add/override with static officials
      staticMap.forEach((s, id) => {
        const overrideScore = overrideMap.get(id);
        allOfficialsMap.set(id, { 
          ...s, 
          overall_score: overrideScore ?? null 
        });
      });

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
        const official = allOfficialsMap.get(candidateId);
        if (!official) return;

        const avgScore = values.reduce((a, b) => a + b, 0) / values.length;
        const roundedScore = Math.round(avgScore * 100) / 100;

        // Check for inversion based on party
        const isInverted = 
          ((['Democrat', 'Independent'].includes(official.party)) && roundedScore > 0) ||
          (official.party === 'Republican' && roundedScore < 0);

        if (isInverted) {
          // Get saved score - check override first, then candidate table
          const savedScore = overrideMap.get(candidateId) ?? official.overall_score;
          
          inverted.push({
            candidate_id: candidateId,
            name: official.name,
            party: official.party,
            office: official.office,
            state: official.state,
            calculated_score: roundedScore,
            answer_count: values.length,
            saved_score: savedScore,
            status: 'INVERTED',
            source: official.source,
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
