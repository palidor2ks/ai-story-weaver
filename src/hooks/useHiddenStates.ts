import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useHiddenStates = () => {
  const query = useQuery({
    queryKey: ['hidden-states'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hidden_states').select('state_code');
      if (error) throw error;
      return new Set<string>((data || []).map((r) => (r.state_code || '').toUpperCase()));
    },
    staleTime: 5 * 60 * 1000,
  });

  const hidden = query.data ?? new Set<string>();
  const isHidden = (state?: string | null) =>
    !!state && hidden.has(state.toUpperCase());

  return { hidden, isHidden, isLoading: query.isLoading };
};
