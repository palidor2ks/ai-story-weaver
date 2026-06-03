import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface IEExclusion {
  fec_committee_id: string;
  reason: string;
  excluded_at: string;
}

export function useIEExclusions() {
  return useQuery({
    queryKey: ['ie-exclusions'],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<IEExclusion[]> => {
      const { data, error } = await supabase
        .from('ie_excluded_committees_public')
        .select('fec_committee_id, reason, excluded_at')
        .order('excluded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IEExclusion[];
    },
  });
}

function invalidateIE(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['ie-exclusions'] });
  qc.invalidateQueries({ queryKey: ['top-spenders'] });
  qc.invalidateQueries({ queryKey: ['independent-expenditures'] });
  qc.invalidateQueries({ queryKey: ['committees'] });
  qc.invalidateQueries({ queryKey: ['committee'] });
}

export function useExcludeCommittee() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ fecCommitteeId, reason }: { fecCommitteeId: string; reason: string }) => {
      const { error } = await supabase
        .from('ie_excluded_committees')
        .upsert(
          {
            fec_committee_id: fecCommitteeId,
            reason,
            excluded_by: user?.id ?? null,
            excluded_at: new Date().toISOString(),
          },
          { onConflict: 'fec_committee_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => invalidateIE(qc),
  });
}

export function useRestoreCommittee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fecCommitteeId: string) => {
      const { error } = await supabase
        .from('ie_excluded_committees')
        .delete()
        .eq('fec_committee_id', fecCommitteeId);
      if (error) throw error;
    },
    onSuccess: () => invalidateIE(qc),
  });
}
