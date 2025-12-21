import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type OfficeLevelType = 'federal_executive' | 'federal_legislative' | 'state_executive' | 'state_legislative' | 'local';

export interface CivicOfficial {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  level: OfficeLevelType;
  state: string;
  district?: string;
  image_url: string;
  phones?: string[];
  urls?: string[];
  emails?: string[];
  is_incumbent: boolean;
  overall_score: number | null;
  coverage_tier: string;
  confidence: string;
}

interface FetchCivicOfficialsResponse {
  officials: CivicOfficial[];
  federalExecutive: CivicOfficial[];
  stateExecutive: CivicOfficial[];
  stateLegislative: CivicOfficial[];
  local: CivicOfficial[];
  normalizedAddress?: string;
  state?: string;
  error?: string;
}

interface CivicOfficialsResult {
  officials: CivicOfficial[];
  federalExecutive: CivicOfficial[];
  stateExecutive: CivicOfficial[];
  stateLegislative: CivicOfficial[];
  local: CivicOfficial[];
  state: string | null;
}

export function useCivicOfficials(address: string | null | undefined) {
  return useQuery({
    queryKey: ['civic-officials', address],
    queryFn: async (): Promise<CivicOfficialsResult> => {
      if (!address) {
        console.log('No address provided for civic officials');
        return { 
          officials: [], 
          federalExecutive: [], 
          stateExecutive: [], 
          stateLegislative: [], 
          local: [],
          state: null 
        };
      }

      console.log('Fetching civic officials for address:', address);

      const { data, error } = await supabase.functions.invoke<FetchCivicOfficialsResponse>(
        'fetch-civic-officials',
        {
          body: { address, includeFederalLegislative: false }
        }
      );

      if (error) {
        console.error('Error fetching civic officials:', error);
        return {
          officials: [],
          federalExecutive: [],
          stateExecutive: [],
          stateLegislative: [],
          local: [],
          state: null,
        };
      }

      if (data?.error) {
        console.error('Civic API error:', data.error);
        return { 
          officials: [], 
          federalExecutive: [], 
          stateExecutive: [], 
          stateLegislative: [], 
          local: [],
          state: null 
        };
      }

      console.log(`Fetched ${data?.officials?.length || 0} civic officials`);

      return { 
        officials: data?.officials || [],
        federalExecutive: data?.federalExecutive || [],
        stateExecutive: data?.stateExecutive || [],
        stateLegislative: data?.stateLegislative || [],
        local: data?.local || [],
        state: data?.state || null
      };
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 1,
  });
}
