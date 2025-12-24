import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FinanceReconciliation {
  id: string;
  candidate_id: string;
  cycle: string;
  local_itemized: number | null;
  local_transfers: number | null;
  local_earmarked: number | null;
  fec_itemized: number | null;
  fec_unitemized: number | null;
  fec_total_receipts: number | null;
  delta_amount: number | null;
  delta_pct: number | null;
  status: string | null;
  checked_at: string | null;
}

export interface CommitteeRollup {
  id: string;
  committee_id: string;
  candidate_id: string;
  cycle: string;
  local_itemized: number | null;
  local_transfers: number | null;
  local_earmarked: number | null;
  local_other: number | null;
  fec_itemized: number | null;
  fec_unitemized: number | null;
  fec_total_receipts: number | null;
  contribution_count: number | null;
  donor_count: number | null;
  last_sync: string | null;
  last_fec_check: string | null;
}

// Hook to get reconciliation data for a single candidate
export function useFinanceReconciliation(candidateId: string | undefined, cycle = '2024') {
  return useQuery({
    queryKey: ['finance-reconciliation', candidateId, cycle],
    queryFn: async () => {
      if (!candidateId) return null;
      
      const { data, error } = await supabase
        .from('finance_reconciliation')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle)
        .maybeSingle();
      
      if (error) throw error;
      return data as FinanceReconciliation | null;
    },
    enabled: !!candidateId,
  });
}

// Hook to get all committee rollups for a candidate
export function useCommitteeRollups(candidateId: string | undefined, cycle = '2024') {
  return useQuery({
    queryKey: ['committee-rollups', candidateId, cycle],
    queryFn: async () => {
      if (!candidateId) return [];
      
      const { data, error } = await supabase
        .from('committee_finance_rollups')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle);
      
      if (error) throw error;
      return (data || []) as CommitteeRollup[];
    },
    enabled: !!candidateId,
  });
}

// Hook to get all reconciliation data for admin dashboard
export function useAllFinanceReconciliations(cycle = '2024') {
  return useQuery({
    queryKey: ['all-finance-reconciliations', cycle],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_reconciliation')
        .select('*')
        .eq('cycle', cycle)
        .order('delta_pct', { ascending: false, nullsFirst: false });
      
      if (error) throw error;
      return (data || []) as FinanceReconciliation[];
    },
  });
}

// Hook to get candidates with sync status
export interface CandidateSyncStatus {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  last_donor_sync: string | null;
  fec_candidate_id: string | null;
  reconciliation: FinanceReconciliation | null;
}

export function useCandidatesWithSyncStatus(cycle = '2024') {
  return useQuery({
    queryKey: ['candidates-sync-status', cycle],
    queryFn: async () => {
      // Get candidates with FEC IDs
      const { data: candidates, error: candError } = await supabase
        .from('candidates')
        .select('id, name, party, office, state, last_donor_sync, fec_candidate_id')
        .not('fec_candidate_id', 'is', null)
        .order('name');
      
      if (candError) throw candError;
      
      // Get reconciliation data
      const { data: reconciliations, error: recError } = await supabase
        .from('finance_reconciliation')
        .select('*')
        .eq('cycle', cycle);
      
      if (recError) throw recError;
      
      const recMap = new Map(
        (reconciliations || []).map(r => [r.candidate_id, r as FinanceReconciliation])
      );
      
      return (candidates || []).map(c => ({
        ...c,
        reconciliation: recMap.get(c.id) || null,
      })) as CandidateSyncStatus[];
    },
  });
}

// Helper to determine sync status
export function getSyncStatus(candidate: CandidateSyncStatus): {
  status: 'ok' | 'warning' | 'error' | 'stale' | 'never';
  label: string;
  color: string;
} {
  if (!candidate.last_donor_sync) {
    return { status: 'never', label: 'Never synced', color: 'text-muted-foreground' };
  }
  
  const lastSync = new Date(candidate.last_donor_sync);
  const daysSince = Math.floor((Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSince > 30) {
    return { status: 'stale', label: `Stale (${daysSince}d ago)`, color: 'text-orange-500' };
  }
  
  if (candidate.reconciliation) {
    const rec = candidate.reconciliation;
    if (rec.status === 'error') {
      return { status: 'error', label: `Variance ${rec.delta_pct}%`, color: 'text-destructive' };
    }
    if (rec.status === 'warning') {
      return { status: 'warning', label: `Variance ${rec.delta_pct}%`, color: 'text-amber-500' };
    }
  }
  
  return { status: 'ok', label: 'Up to date', color: 'text-agree' };
}
