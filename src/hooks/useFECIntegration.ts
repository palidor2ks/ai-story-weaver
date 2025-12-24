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
  hasMore?: boolean;
  stoppedDueToTimeout?: boolean;
  reconciliation?: {
    localItemized: number;
    localTransfers: number;
    fecItemized: number;
    deltaPct: number;
    status: string;
  };
}

export function useFECIntegration() {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [donorLoadingIds, setDonorLoadingIds] = useState<Set<string>>(new Set());
  const [partialSyncIds, setPartialSyncIds] = useState<Set<string>>(new Set()); // Track candidates with hasMore=true
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);

  const isLoading = (candidateId: string) => loadingIds.has(candidateId);
  const isDonorLoading = (candidateId: string) => donorLoadingIds.has(candidateId);
  const hasPartialSync = (candidateId: string) => partialSyncIds.has(candidateId);

  const fetchFECCandidateId = async (
    candidateId: string,
    candidateName: string,
    state: string,
    updateDatabase = true,
    autoFetchDonors = true
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

      const result = data as FetchFECIdResult;

      // Auto-fetch donors if FEC ID was found and updated
      if (autoFetchDonors && result.found && result.updated && result.fecCandidateId) {
        console.log('[FEC] Auto-fetching donors for', candidateName);
        toast.info(`Fetching donor data for ${candidateName}...`);
        
        const donorResult = await fetchFECDonors(candidateId, result.fecCandidateId);
        if (donorResult.success) {
          toast.success(`Imported ${donorResult.imported} donors for ${candidateName}`);
        } else if (donorResult.error) {
          toast.error(`Failed to fetch donors: ${donorResult.error}`);
        }
      }

      return result;
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
    cycle = '2024',
    forceFullSync = false
  ): Promise<FetchDonorsResult> => {
    setDonorLoadingIds(prev => new Set(prev).add(candidateId));
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-fec-donors', {
        body: { candidateId, fecCandidateId, cycle, forceFullSync }
      });

      if (error) {
        console.error('[FEC-DONORS] Error:', error);
        // Mark as partial sync on error so user can retry
        setPartialSyncIds(prev => new Set(prev).add(candidateId));
        return { success: false, imported: 0, error: error.message, hasMore: true };
      }

      const result = data as FetchDonorsResult;
      
      // Track partial sync state
      if (result.hasMore) {
        setPartialSyncIds(prev => new Set(prev).add(candidateId));
      } else {
        setPartialSyncIds(prev => {
          const next = new Set(prev);
          next.delete(candidateId);
          return next;
        });
      }

      return result;
    } catch (err) {
      console.error('[FEC-DONORS] Exception:', err);
      setPartialSyncIds(prev => new Set(prev).add(candidateId));
      return { success: false, imported: 0, error: 'Failed to fetch donors', hasMore: true };
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

  const resumeAllPartialSyncs = async (
    candidates: Array<{ id: string; name: string; fecCandidateId: string }>,
    cycle = '2024'
  ) => {
    const results = { resumed: 0, completed: 0, stillPartial: 0, totalImported: 0, totalRaised: 0 };
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setBatchProgress({
        current: i + 1,
        total: candidates.length,
        currentName: `Resuming: ${candidate.name}`
      });

      // Keep calling until hasMore is false or we hit an error
      let hasMore = true;
      let attempts = 0;
      const maxAttempts = 10; // Safety limit per candidate
      
      while (hasMore && attempts < maxAttempts) {
        attempts++;
        const result = await fetchFECDonors(
          candidate.id,
          candidate.fecCandidateId,
          cycle
        );

        results.totalImported += result.imported;
        results.totalRaised += result.totalRaised || 0;
        
        hasMore = result.hasMore === true;
        
        if (!result.success) {
          break;
        }
        
        // Small delay between pages
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      results.resumed++;
      if (!hasMore) {
        results.completed++;
      } else {
        results.stillPartial++;
      }

      // Delay between candidates
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
    resumeAllPartialSyncs,
    isLoading,
    isDonorLoading,
    hasPartialSync,
    partialSyncIds,
    batchProgress,
    isBatchRunning: batchProgress !== null
  };
}
