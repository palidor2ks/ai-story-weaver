import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useImportFecCommittee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (committeeId: string) => {
      const { data, error } = await supabase.functions.invoke('import-fec-committee', {
        body: { committee_id: committeeId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-external-committees'] });
      toast.success(`Imported ${data?.committee?.name ?? 'committee'}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSyncFecCommittees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-fec-committees', { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('FEC sync started — committees will appear over the next few minutes');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['admin-external-committees'] }), 30000);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
