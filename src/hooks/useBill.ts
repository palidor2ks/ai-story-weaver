import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Bill = Database['public']['Tables']['bills']['Row'];

export const useBill = (billId: string | undefined) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bill', billId],
    queryFn: async (): Promise<Bill | null> => {
      if (!billId) return null;
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('id', billId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!billId,
    staleTime: 1000 * 60 * 10,
  });

  return { data: data ?? null, isLoading, error };
};
