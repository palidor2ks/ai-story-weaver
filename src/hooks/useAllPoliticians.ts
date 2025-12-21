import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Representative {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  state: string;
  district: string | null;
  image_url: string;
  is_incumbent: boolean;
  bioguide_id: string;
  overall_score: number | null;
  coverage_tier: string;
  confidence: string;
}

interface FetchAllResponse {
  representatives: Representative[];
  total: number;
  error?: string;
}

export function useAllPoliticians() {
  return useQuery({
    queryKey: ['all-politicians'],
    queryFn: async (): Promise<Representative[]> => {
      console.log('Fetching all Congress members...');

      const { data, error } = await supabase.functions.invoke<FetchAllResponse>(
        'fetch-representatives',
        {
          body: { fetchAll: true }
        }
      );

      if (error) {
        console.error('Error fetching all politicians:', error);
        throw error;
      }

      if (data?.error) {
        console.error('API error:', data.error);
        return [];
      }

      console.log(`Fetched ${data?.representatives?.length || 0} Congress members`);
      return data?.representatives || [];
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 1,
  });
}
