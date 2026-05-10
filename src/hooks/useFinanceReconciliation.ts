import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FinanceReconciliation {
  id: string;
  candidate_id: string;
  cycle: string;
  local_itemized: number | null;
  local_itemized_net: number | null; // Excludes earmark pass-throughs - comparable to FEC
  local_transfers: number | null;
  local_earmarked: number | null;
  local_other_receipts: number | null; // Line 14 + Line 15
  // Category-level local tracking
  local_individual_itemized: number | null;
  local_pac_contributions: number | null;
  local_party_contributions: number | null;
  local_organization: number | null; // Organizations on Line 11A (not counted in FEC individual)
  local_loans: number | null;
  // FEC data
  fec_itemized: number | null;
  fec_unitemized: number | null;
  fec_total_receipts: number | null;
  fec_pac_contributions: number | null;
  fec_party_contributions: number | null;
  // Additional FEC breakdown (for complete receipt accounting)
  fec_loans: number | null;
  fec_transfers: number | null;
  fec_candidate_contribution: number | null;
  fec_other_receipts: number | null;
  fec_offsets_to_operating_expenditures: number | null; // Line 14
  // Category-level deltas
  individual_delta_amount: number | null;
  individual_delta_pct: number | null;
  pac_delta_amount: number | null;
  pac_delta_pct: number | null;
  // Overall delta (itemized comparison for data integrity)
  delta_amount: number | null;
  delta_pct: number | null;
  // Total receipts delta (for UI display - matches FEC/Local columns)
  total_receipts_delta_amount: number | null;
  total_receipts_delta_pct: number | null;
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
  // Category-level local tracking
  local_individual_itemized: number | null;
  local_pac_contributions: number | null;
  local_party_contributions: number | null;
  fec_itemized: number | null;
  fec_unitemized: number | null;
  fec_total_receipts: number | null;
  contribution_count: number | null;
  donor_count: number | null;
  last_sync: string | null;
  last_fec_check: string | null;
}

// Numeric fields on finance_reconciliation that are safe to sum across cycles.
const SUMMABLE_RECONCILIATION_FIELDS: Array<keyof FinanceReconciliation> = [
  'local_itemized', 'local_itemized_net', 'local_transfers', 'local_earmarked',
  'local_other_receipts', 'local_individual_itemized', 'local_pac_contributions',
  'local_party_contributions', 'local_organization', 'local_loans',
  'fec_itemized', 'fec_unitemized', 'fec_total_receipts',
  'fec_pac_contributions', 'fec_party_contributions', 'fec_loans',
  'fec_transfers', 'fec_candidate_contribution', 'fec_other_receipts',
  'fec_offsets_to_operating_expenditures',
];

function aggregateReconciliations(
  rows: FinanceReconciliation[],
  candidateId: string,
): FinanceReconciliation | null {
  if (!rows.length) return null;
  const agg: any = {
    id: 'aggregate',
    candidate_id: candidateId,
    cycle: 'all',
    status: 'ok',
    checked_at: rows.map(r => r.checked_at).filter(Boolean).sort().slice(-1)[0] ?? null,
    individual_delta_amount: null, individual_delta_pct: null,
    pac_delta_amount: null, pac_delta_pct: null,
    delta_amount: null, delta_pct: null,
    total_receipts_delta_amount: null, total_receipts_delta_pct: null,
  };
  for (const f of SUMMABLE_RECONCILIATION_FIELDS) {
    agg[f] = rows.reduce((s, r) => s + (Number(r[f] ?? 0) || 0), 0);
  }
  return agg as FinanceReconciliation;
}

// Hook to get reconciliation data for a single candidate.
// Pass cycle='all' (with cycles[]) to get a summed aggregate across cycles.
export function useFinanceReconciliation(
  candidateId: string | undefined,
  cycle: string | undefined = '2024',
  cyclesForAll?: string[],
) {
  const isAll = cycle === 'all';
  return useQuery({
    queryKey: ['finance-reconciliation', candidateId, cycle, isAll ? cyclesForAll?.join(',') : null],
    queryFn: async () => {
      if (!candidateId) return null;

      if (isAll) {
        let q = supabase
          .from('finance_reconciliation')
          .select('*')
          .eq('candidate_id', candidateId);
        if (cyclesForAll && cyclesForAll.length) q = q.in('cycle', cyclesForAll);
        const { data, error } = await q;
        if (error) throw error;
        return aggregateReconciliations((data || []) as FinanceReconciliation[], candidateId);
      }

      const { data, error } = await supabase
        .from('finance_reconciliation')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle!)
        .maybeSingle();

      if (error) throw error;
      return data as FinanceReconciliation | null;
    },
    enabled: !!candidateId && !!cycle && (!isAll || !!cyclesForAll),
  });
}

// Hook to get all committee rollups for a candidate.
// Pass cycle='all' (with cycles[]) to fetch rollups across all listed cycles.
export function useCommitteeRollups(
  candidateId: string | undefined,
  cycle: string | undefined = '2024',
  cyclesForAll?: string[],
) {
  const isAll = cycle === 'all';
  return useQuery({
    queryKey: ['committee-rollups', candidateId, cycle, isAll ? cyclesForAll?.join(',') : null],
    queryFn: async () => {
      if (!candidateId) return [];

      let q = supabase
        .from('committee_finance_rollups')
        .select('*')
        .eq('candidate_id', candidateId);

      if (isAll) {
        if (cyclesForAll && cyclesForAll.length) q = q.in('cycle', cyclesForAll);
      } else {
        q = q.eq('cycle', cycle!);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CommitteeRollup[];
    },
    enabled: !!candidateId && !!cycle && (!isAll || !!cyclesForAll),
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
