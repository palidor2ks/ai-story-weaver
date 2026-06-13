import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PolicyPosition {
  topic: string;
  stance: string;
  detail: string;
}

export function usePolicyCardPositions(
  candidateId: string | null | undefined,
  enabled = true,
) {
  return useQuery<PolicyPosition[]>({
    queryKey: ['policy-card-positions', candidateId],
    enabled: !!candidateId && enabled,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-policy-card-positions', {
        body: { candidateId },
      });
      if (error) throw error;
      return ((data as { positions?: PolicyPosition[] }).positions ?? []);
    },
  });
}
