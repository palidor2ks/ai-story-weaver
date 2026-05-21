import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportResult {
  success: boolean;
  message: string;
  committee?: {
    id: string;
    fec_committee_id: string;
    name: string;
    designation: string;
    designation_full: string;
  };
  alreadyExists?: boolean;
  error?: string;
}

interface FetchDonorsResult {
  success: boolean;
  message: string;
  stats?: {
    receipts: number;
    contributions: number;
    donors: number;
    totalAmount: number;
    pagesFetched: number;
  };
  error?: string;
}

async function readFunctionError(error: any): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json().catch(() => null);
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
    if (ctx && typeof ctx.text === 'function') {
      const txt = await ctx.clone().text().catch(() => '');
      if (txt) return txt;
    }
  } catch {
    /* ignore */
  }
  return error?.message ?? 'Unknown error';
}

export function useImportExternalCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (committeeId: string): Promise<ImportResult> => {
      const { data, error } = await supabase.functions.invoke('import-external-committee', {
        body: { committeeId }
      });

      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unallocated-committees'] });
      queryClient.invalidateQueries({ queryKey: ['committee-diagnostics'] });
      
      if (data.alreadyExists) {
        toast.info(data.message);
      } else {
        toast.success(data.message);
      }
    },
    onError: (error: Error) => {
      console.error('Error importing committee:', error);
      toast.error(`Failed to import committee: ${error.message}`);
    },
  });
}

export function useFetchCommitteeDonors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ committeeId, cycle = '2024' }: { committeeId: string; cycle?: string }): Promise<FetchDonorsResult> => {
      const { data, error } = await supabase.functions.invoke('fetch-committee-donors', {
        body: { committeeId, cycle }
      });

      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unallocated-committees'] });
      queryClient.invalidateQueries({ queryKey: ['committee-diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      console.error('Error fetching committee donors:', error);
      toast.error(`Failed to fetch donors: ${error.message}`);
    },
  });
}
