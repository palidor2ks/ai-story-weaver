import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PopulateResult {
  success: boolean;
  questionsProcessed?: number;
  results?: Record<string, { success: number; failed: number }>;
  error?: string;
}

export function usePopulatePartyAnswers() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const populate = async (partyId?: string): Promise<PopulateResult> => {
    setIsLoading(true);
    setProgress(partyId ? `Generating ${partyId} answers...` : 'Generating all party answers...');
    
    try {
      const { data, error } = await supabase.functions.invoke('populate-party-answers', {
        body: partyId ? { partyId } : {},
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as PopulateResult;
      
      if (result.success) {
        const totalSuccess = result.results 
          ? Object.values(result.results).reduce((sum, r) => sum + r.success, 0)
          : 0;
        toast.success(`Generated ${totalSuccess} party answers successfully`);
      }

      setProgress(null);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate party answers';
      toast.error(message);
      setProgress(null);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const populateAll = () => populate();
  const populateParty = (partyId: string) => populate(partyId);

  return {
    isLoading,
    progress,
    populateAll,
    populateParty,
  };
}
