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

// Unique key for party+topic combination
const getLoadingKey = (partyId: string, topicId?: string) => 
  topicId ? `${partyId}:${topicId}` : partyId;

export function usePopulatePartyAnswers() {
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const populateParty = async (partyId: string, forceRegenerate = false): Promise<PopulateResult> => {
    const key = getLoadingKey(partyId);
    setLoadingKeys(prev => ({ ...prev, [key]: true }));
    setProgress(prev => ({ ...prev, [key]: 'Starting...' }));
    
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
        queryClient.invalidateQueries({ queryKey: ['party-answer-stats'] });
        queryClient.invalidateQueries({ queryKey: ['party-answer-stats-by-topic'] });
      }

      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[key];
        return newProgress;
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate party answers';
      toast.error(`${partyId}: ${message}`);
      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[key];
        return newProgress;
      });
      return { success: false, error: message };
    } finally {
      setLoadingKeys(prev => ({ ...prev, [key]: false }));
    }
  };

  const populatePartyTopic = async (partyId: string, topicId: string, forceRegenerate = false): Promise<PopulateResult> => {
    const key = getLoadingKey(partyId, topicId);
    setLoadingKeys(prev => ({ ...prev, [key]: true }));
    setProgress(prev => ({ ...prev, [key]: 'Starting...' }));
    
    try {
      const { data, error } = await supabase.functions.invoke('populate-party-answers', {
        body: { partyId, topicId, skipExisting: !forceRegenerate },
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as PopulateResult;
      
      if (result.success) {
        if (result.skipped) {
          toast.info(`Topic complete: All questions already have answers`);
        } else {
          toast.success(`Generated ${result.inserted || 0} answers for topic`);
        }
        queryClient.invalidateQueries({ queryKey: ['party-answer-stats'] });
        queryClient.invalidateQueries({ queryKey: ['party-answer-stats-by-topic'] });
      }

      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[key];
        return newProgress;
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate topic answers';
      toast.error(`Topic generation failed: ${message}`);
      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[key];
        return newProgress;
      });
      return { success: false, error: message };
    } finally {
      setLoadingKeys(prev => ({ ...prev, [key]: false }));
    }
  };

  const enrichPartySources = async (partyId: string, topicId?: string): Promise<PopulateResult> => {
    const key = `enrich:${getLoadingKey(partyId, topicId)}`;
    setLoadingKeys(prev => ({ ...prev, [key]: true }));
    setProgress(prev => ({ ...prev, [key]: 'Researching sources...' }));
    
    try {
      const { data, error } = await supabase.functions.invoke('enrich-party-sources', {
        body: { partyId, topicId },
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as PopulateResult & { enriched?: number; status?: string; totalToEnrich?: number };
      
      if (result.success) {
        if (result.skipped) {
          toast.info(`All answers already have sources`);
        } else if (result.status === 'processing') {
          toast.info(`Source enrichment started for ${result.totalToEnrich} answers. Check edge function logs for progress.`);
        } else {
          toast.success(`Enriched ${result.enriched || 0} answers with sources`);
        }
        queryClient.invalidateQueries({ queryKey: ['party-answer-stats'] });
        queryClient.invalidateQueries({ queryKey: ['party-answer-stats-by-topic'] });
      }

      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[key];
        return newProgress;
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enrich sources';
      toast.error(`Source enrichment failed: ${message}`);
      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[key];
        return newProgress;
      });
      return { success: false, error: message };
    } finally {
      setLoadingKeys(prev => ({ ...prev, [key]: false }));
    }
  };

  const isLoading = (partyId: string, topicId?: string) => 
    loadingKeys[getLoadingKey(partyId, topicId)] || false;

  const isEnriching = (partyId: string, topicId?: string) => 
    loadingKeys[`enrich:${getLoadingKey(partyId, topicId)}`] || false;
  
  const getProgress = (partyId: string, topicId?: string) => 
    progress[getLoadingKey(partyId, topicId)] || null;
  
  const isAnyLoading = Object.values(loadingKeys).some(Boolean);

  return {
    populateParty,
    populatePartyTopic,
    enrichPartySources,
    isLoading,
    isEnriching,
    getProgress,
    isAnyLoading,
  };
}
