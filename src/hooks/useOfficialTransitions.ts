import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OfficialTransition {
  id: string;
  official_name: string;
  current_office: string | null;
  new_office: string;
  state: string;
  district: string | null;
  party: string | null;
  election_date: string;
  inauguration_date: string;
  transition_type: string;
  source_url: string | null;
  ai_confidence: string | null;
  verified: boolean | null;
  is_active: boolean | null;
}

export function useOfficialTransitions(state?: string) {
  return useQuery({
    queryKey: ['official-transitions', state],
    queryFn: async () => {
      let query = supabase
        .from('official_transitions')
        .select('*')
        .eq('is_active', true)
        .order('inauguration_date', { ascending: true });

      if (state) {
        query = query.eq('state', state.toUpperCase());
      }

      const { data, error } = await query;

      if (error) {
        console.error('[useOfficialTransitions] Error:', error);
        throw error;
      }

      return data as OfficialTransition[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useTransitionForOfficial(officialName: string, state?: string) {
  const { data: transitions, ...rest } = useOfficialTransitions(state);
  
  const transition = transitions?.find(t => 
    t.official_name.toLowerCase() === officialName.toLowerCase()
  );
  
  return { transition, ...rest };
}
