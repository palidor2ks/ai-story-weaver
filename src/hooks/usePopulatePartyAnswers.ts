import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface PopulateResult {
  success: boolean;
  questionsProcessed?: number;
  inserted?: number;
  errors?: number;
  party?: string;
  partyId?: string;
  skipped?: boolean;
  message?: string;
  error?: string;
}

export function usePopulatePartyAnswers() {
  const [loadingParties, setLoadingParties] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const populateParty = async (partyId: string, forceRegenerate = false): Promise<PopulateResult> => {
    setLoadingParties(prev => ({ ...prev, [partyId]: true }));
    setProgress(prev => ({ ...prev, [partyId]: 'Starting...' }));
    
    try {
      const { data, error } = await supabase.functions.invoke('populate-party-answers', {
        body: { partyId, skipExisting: !forceRegenerate },
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as PopulateResult;
      
      if (result.success) {
        if (result.skipped) {
          toast.info(`${result.party}: All questions already have answers`);
        } else {
          toast.success(`${result.party}: Generated ${result.inserted || 0} answers`);
        }
        // Invalidate stats to refresh counts
        queryClient.invalidateQueries({ queryKey: ['party-answer-stats'] });
      }

      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[partyId];
        return newProgress;
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate party answers';
      toast.error(`${partyId}: ${message}`);
      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[partyId];
        return newProgress;
      });
      return { success: false, error: message };
    } finally {
      setLoadingParties(prev => ({ ...prev, [partyId]: false }));
    }
  };

  const isLoading = (partyId: string) => loadingParties[partyId] || false;
  const getProgress = (partyId: string) => progress[partyId] || null;
  const isAnyLoading = Object.values(loadingParties).some(Boolean);

  return {
    populateParty,
    isLoading,
    getProgress,
    isAnyLoading,
  };
}
