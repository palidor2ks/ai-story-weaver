import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface PopulateResult {
  success: boolean;
  candidateId: string;
  generated?: number;
  existing?: number;
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
      
      if (generated > 0) {
        toast.success(`Generated ${generated} answers`);
      } else if (existing > 0) {
        toast.info(`Already has ${existing} answers`);
      }

      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['sync-stats'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-answers'] });

      return { success: true, candidateId, generated, existing };
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
        } else {
          successCount++;
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

    queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
    queryClient.invalidateQueries({ queryKey: ['sync-stats'] });
    queryClient.invalidateQueries({ queryKey: ['candidate-answers'] });

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
