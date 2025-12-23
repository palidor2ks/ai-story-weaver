import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FECCandidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district?: string;
  cycles: number[];
}

interface FetchFECIdResult {
  found: boolean;
  updated?: boolean;
  fecCandidateId?: string;
  candidates?: FECCandidate[];
  error?: string;
}

interface FetchDonorsResult {
  success: boolean;
  imported: number;
  totalRaised?: number;
  cycle?: string;
  message?: string;
  error?: string;
}

export function useFECIntegration() {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [donorLoadingIds, setDonorLoadingIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);

  const isLoading = (candidateId: string) => loadingIds.has(candidateId);
  const isDonorLoading = (candidateId: string) => donorLoadingIds.has(candidateId);

  const fetchFECCandidateId = async (
    candidateId: string,
    candidateName: string,
    state: string,
    updateDatabase = true
  ): Promise<FetchFECIdResult> => {
    setLoadingIds(prev => new Set(prev).add(candidateId));
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-fec-candidate-id', {
        body: { candidateId, candidateName, state, updateDatabase }
      });

      if (error) {
        console.error('[FEC] Error:', error);
        return { found: false, error: error.message };
      }

      return data as FetchFECIdResult;
    } catch (err) {
      console.error('[FEC] Exception:', err);
      return { found: false, error: 'Failed to fetch FEC candidate ID' };
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  const fetchFECDonors = async (
    candidateId: string,
    fecCandidateId: string,
    cycle = '2024'
  ): Promise<FetchDonorsResult> => {
    setDonorLoadingIds(prev => new Set(prev).add(candidateId));
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-fec-donors', {
        body: { candidateId, fecCandidateId, cycle }
      });

      if (error) {
        console.error('[FEC-DONORS] Error:', error);
        return { success: false, imported: 0, error: error.message };
      }

      return data as FetchDonorsResult;
    } catch (err) {
      console.error('[FEC-DONORS] Exception:', err);
      return { success: false, imported: 0, error: 'Failed to fetch donors' };
    } finally {
      setDonorLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  const batchFetchFECIds = async (
    candidates: Array<{ id: string; name: string; state: string }>
  ) => {
    const results = { success: 0, failed: 0 };
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setBatchProgress({
        current: i + 1,
        total: candidates.length,
        currentName: candidate.name
      });

      const result = await fetchFECCandidateId(
        candidate.id,
        candidate.name,
        candidate.state,
        true
      );

      if (result.found && result.updated) {
        results.success++;
      } else {
        results.failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setBatchProgress(null);
    return results;
  };

  const batchFetchDonors = async (
    candidates: Array<{ id: string; name: string; fecCandidateId: string }>,
    cycle = '2024'
  ) => {
    const results = { success: 0, failed: 0, totalImported: 0, totalRaised: 0 };
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setBatchProgress({
        current: i + 1,
        total: candidates.length,
        currentName: candidate.name
      });

      const result = await fetchFECDonors(
        candidate.id,
        candidate.fecCandidateId,
        cycle
      );

      if (result.success) {
        results.success++;
        results.totalImported += result.imported;
        results.totalRaised += result.totalRaised || 0;
      } else {
        results.failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setBatchProgress(null);
    return results;
  };

  return {
    fetchFECCandidateId,
    fetchFECDonors,
    batchFetchFECIds,
    batchFetchDonors,
    isLoading,
    isDonorLoading,
    batchProgress,
    isBatchRunning: batchProgress !== null
  };
}
