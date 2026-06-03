import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CommitteePoolRow {
  fec_committee_id: string;
  name: string | null;
  designation: string | null;
  committee_type: string | null;
  source: 'candidate_committees' | 'independent_expenditures' | 'external_pacs';
  primary_cause_id: string | null;
  secondary_cause_ids: string[] | null;
  admin_overridden: boolean | null;
  ai_confidence: string | null;
  ai_reasoning: string | null;
  total_count: number;
}

export interface UseCommitteePoolArgs {
  search: string;
  source: 'all' | 'candidate_committees' | 'independent_expenditures' | 'external_pacs';
  assigned: 'all' | 'unassigned' | 'ai' | 'admin' | 'low-confidence';
  page: number;
  pageSize?: number;
}

export const useDebounced = <T,>(value: T, ms = 300): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

export const useCommitteePool = ({ search, source, assigned, page, pageSize = 100 }: UseCommitteePoolArgs) => {
  const debouncedSearch = useDebounced(search, 300);
  return useQuery({
    queryKey: ['committee-pool', debouncedSearch, source, assigned, page, pageSize],
    placeholderData: keepPreviousData,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_committee_pool', {
        p_search: debouncedSearch || null,
        p_source: source === 'all' ? null : source,
        p_assigned: assigned === 'all' ? null : assigned,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CommitteePoolRow[];
      return {
        rows,
        total: rows[0]?.total_count ?? 0,
      };
    },
  });
};

export const useRefreshCommitteePool = () => {
  const qc = useQueryClient();
  return async () => {
    const { error } = await supabase.rpc('refresh_committee_pool');
    if (error) {
      toast.error(error.message ?? 'Refresh failed');
      return false;
    }
    toast.success('Committee pool refreshed');
    qc.invalidateQueries({ queryKey: ['committee-pool'] });
    return true;
  };
};
