import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExpenditureBreakdown {
  candidate_name: string;
  fec_candidate_id: string;
  mapped: boolean;
  support: number;
  oppose: number;
  support_ratio: string;
  oppose_ratio: string;
}

interface FetchExpendituresResult {
  success: boolean;
  message: string;
  stats?: {
    committee_id: string;
    committee_name: string;
    cycle: string;
    expenditure_records: number;
    candidates_with_expenditures: number;
    candidates_mapped: number;
    total_spent: number;
    breakdown: ExpenditureBreakdown[];
  };
  error?: string;
}

export interface PacExpenditure {
  id: string;
  committee_id: string;
  committee_name: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  fec_candidate_id: string | null;
  support_oppose: 'support' | 'oppose';
  total_amount: number;
  expenditure_count: number;
  cycle: string;
  last_expenditure_date: string | null;
}

export interface PacCandidateTotal {
  id: string;
  committee_id: string;
  committee_name: string | null;
  candidate_id: string;
  candidate_name: string | null;
  support_total: number;
  oppose_total: number;
  total_spent: number;
  support_ratio: number;
  oppose_ratio: number;
  cycle: string;
}

export function useFetchPacExpenditures() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ committeeId, cycle = '2024' }: { committeeId: string; cycle?: string }): Promise<FetchExpendituresResult> => {
      const { data, error } = await supabase.functions.invoke('fetch-pac-expenditures', {
        body: { committeeId, cycle }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pac-expenditures'] });
      queryClient.invalidateQueries({ queryKey: ['pac-candidate-totals'] });
      queryClient.invalidateQueries({ queryKey: ['pac-expenditure-summary'] });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      console.error('Error fetching PAC expenditures:', error);
      toast.error(`Failed to fetch expenditures: ${error.message}`);
    },
  });
}

interface FetchDonorsResult {
  success: boolean;
  message: string;
  stats?: {
    receipts: number;
    donors: number;
    totalAmount: number;
    pagesFetched: number;
    topDonors?: Array<{ name: string; type: string; amount: number }>;
  };
  error?: string;
}

export function useFetchPacDonors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ committeeId, cycle = '2024' }: { committeeId: string; cycle?: string }): Promise<FetchDonorsResult> => {
      const { data, error } = await supabase.functions.invoke('fetch-pac-donors', {
        body: { committeeId, cycle }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pac-donors'] });
      queryClient.invalidateQueries({ queryKey: ['attributed-donors'] });
      queryClient.invalidateQueries({ queryKey: ['donor-attributed-impact'] });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      console.error('Error fetching PAC donors:', error);
      toast.error(`Failed to fetch donors: ${error.message}`);
    },
  });
}

export function usePacExpenditures(committeeId: string | undefined, cycle: string = '2024') {
  return useQuery({
    queryKey: ['pac-expenditures', committeeId, cycle],
    queryFn: async () => {
      if (!committeeId) return [];
      
      const { data, error } = await supabase
        .from('pac_expenditures')
        .select('*')
        .eq('committee_id', committeeId)
        .eq('cycle', cycle)
        .order('total_amount', { ascending: false });

      if (error) throw error;
      return data as PacExpenditure[];
    },
    enabled: !!committeeId,
  });
}

export function usePacCandidateTotals(committeeId: string | undefined, cycle: string = '2024') {
  return useQuery({
    queryKey: ['pac-candidate-totals', committeeId, cycle],
    queryFn: async () => {
      if (!committeeId) return [];
      
      const { data, error } = await supabase
        .from('pac_candidate_totals')
        .select('*')
        .eq('committee_id', committeeId)
        .eq('cycle', cycle)
        .order('total_spent', { ascending: false });

      if (error) throw error;
      return data as PacCandidateTotal[];
    },
    enabled: !!committeeId,
  });
}

export function useCandidatePacActivity(candidateId: string | undefined, cycle: string = '2024') {
  return useQuery({
    queryKey: ['candidate-pac-activity', candidateId, cycle],
    queryFn: async () => {
      if (!candidateId) return { supporting: [], opposing: [] };
      
      const { data, error } = await supabase
        .from('pac_candidate_totals')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle)
        .order('total_spent', { ascending: false });

      if (error) throw error;
      
      const totals = data as PacCandidateTotal[];
      
      return {
        supporting: totals.filter(t => t.support_total > 0),
        opposing: totals.filter(t => t.oppose_total > 0),
      };
    },
    enabled: !!candidateId,
  });
}
