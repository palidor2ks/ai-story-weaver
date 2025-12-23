import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface PopulateResult {
  success: boolean;
  candidateId: string;
  generated?: number;
  existing?: number;
  missingBefore?: number;
  failedChunks?: number;
  error?: string;
}

interface BatchProgress {
  total: number;
  completed: number;
  currentName: string;
  errors: number;
}

export function usePopulateCandidateAnswers() {
  const [loadingCandidates, setLoadingCandidates] = useState<Record<string, boolean>>({});
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const queryClient = useQueryClient();

  const populateCandidate = async (candidateId: string, forceRegenerate = false): Promise<PopulateResult> => {
    setLoadingCandidates(prev => ({ ...prev, [candidateId]: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('get-candidate-answers', {
        body: { candidateId, forceRegenerate },
      });

      if (error) {
        throw new Error(error.message);
      }

      const generated = data?.generated || 0;
      const existing = data?.existing || 0;
      const missingBefore = data?.missingBefore || 0;
      const failedChunks = data?.failedChunks || 0;
      const finalCount = data?.finalCount || 0;
      const totalQuestions = data?.totalQuestions || 0;
      
      // Show appropriate toast based on result
      if (generated > 0) {
        toast.success(`Generated ${generated} answers (${finalCount}/${totalQuestions} total)`);
      } else if (missingBefore > 0 && generated === 0) {
        // Tried to generate but failed (AI returned empty/invalid)
        toast.error(`Failed to generate ${missingBefore} missing answers - check logs`);
      } else if (missingBefore === 0 && existing > 0) {
        // Already has full coverage
        toast.info(`Already has all ${existing} answers`);
      } else {
        toast.info(`No answers generated`);
      }

      // Immediately refetch coverage data
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['candidates-answer-coverage'] }),
        queryClient.refetchQueries({ queryKey: ['candidate-answer-stats'] }),
        queryClient.refetchQueries({ queryKey: ['candidate-answers'] }),
        queryClient.refetchQueries({ queryKey: ['sync-stats'] }),
      ]);

      return { success: generated > 0 || missingBefore === 0, candidateId, generated, existing, missingBefore, failedChunks };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate answers';
      toast.error(message);
      return { success: false, candidateId, error: message };
    } finally {
      setLoadingCandidates(prev => ({ ...prev, [candidateId]: false }));
    }
  };

  const populateBatch = async (
    candidates: Array<{ id: string; name: string }>,
    forceRegenerate = false
  ): Promise<{ success: number; errors: number }> => {
    setBatchProgress({ total: candidates.length, completed: 0, currentName: '', errors: 0 });
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setBatchProgress(prev => prev ? { ...prev, currentName: candidate.name, completed: i } : null);

      try {
        const { data, error } = await supabase.functions.invoke('get-candidate-answers', {
          body: { candidateId: candidate.id, forceRegenerate },
        });

        if (error) {
          errorCount++;
          console.error(`Error for ${candidate.name}:`, error);
        } else if (data?.generated > 0 || data?.missingBefore === 0) {
          successCount++;
        } else {
          // Generation was attempted but failed
          errorCount++;
          console.error(`Generation failed for ${candidate.name}: no answers returned`);
        }
      } catch (error) {
        errorCount++;
        console.error(`Error for ${candidate.name}:`, error);
      }

      setBatchProgress(prev => prev ? { ...prev, completed: i + 1, errors: errorCount } : null);

      // Small delay to avoid rate limiting
      if (i < candidates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setBatchProgress(null);

    // Refetch all relevant queries
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['candidates-answer-coverage'] }),
      queryClient.refetchQueries({ queryKey: ['candidate-answer-stats'] }),
      queryClient.refetchQueries({ queryKey: ['candidate-answers'] }),
      queryClient.refetchQueries({ queryKey: ['sync-stats'] }),
    ]);

    toast.success(`Generated answers for ${successCount} candidates${errorCount > 0 ? ` (${errorCount} errors)` : ''}`);

    return { success: successCount, errors: errorCount };
  };

  const isLoading = (candidateId: string) => loadingCandidates[candidateId] || false;
  const isAnyLoading = Object.values(loadingCandidates).some(Boolean);
  const isBatchRunning = batchProgress !== null;

  return {
    populateCandidate,
    populateBatch,
    isLoading,
    isAnyLoading,
    isBatchRunning,
    batchProgress,
  };
}
