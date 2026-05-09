import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TransitionStatus } from '@/types';
import { useGeocode } from './useGeocode';

export type OfficeLevelType = 'federal_executive' | 'federal_legislative' | 'state_executive' | 'state_legislative' | 'local';

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
  // Transition fields
  transition_status?: TransitionStatus;
  new_office?: string;
  inauguration_date?: string;
}

interface FetchCivicOfficialsResponse {
  officials: CivicOfficial[];
  federalExecutive: CivicOfficial[];
  stateExecutive: CivicOfficial[];
  stateLegislative: CivicOfficial[];
  local: CivicOfficial[];
  normalizedAddress?: string;
  state?: string;
  hasTransitions?: boolean;
  error?: string;
}

interface CivicOfficialsResult {
  officials: CivicOfficial[];
  federalExecutive: CivicOfficial[];
  stateExecutive: CivicOfficial[];
  stateLegislative: CivicOfficial[];
  local: CivicOfficial[];
  state: string | null;
  hasTransitions: boolean;
}

export function useCivicOfficials(address: string | null | undefined) {
  // Reuse the shared geocode result to skip a duplicate Census round-trip server-side.
  const geocodeQuery = useGeocode(address);
  const geocode = geocodeQuery.data;

  return useQuery({
    queryKey: ['civic-officials', address, geocode?.state, geocode?.lat, geocode?.lng, 'v7'],
    queryFn: async (): Promise<CivicOfficialsResult> => {
      if (!address) {
        return {
          officials: [], federalExecutive: [], stateExecutive: [],
          stateLegislative: [], local: [],
          state: null, hasTransitions: false,
        };
      }

      console.log('Fetching civic officials for address:', address, 'geocode:', geocode);

      const { data, error } = await supabase.functions.invoke<FetchCivicOfficialsResponse>(
        'fetch-civic-officials',
        {
          body: {
            address,
            includeFederalLegislative: false,
            // Pass geocode hints so the edge function skips its own Census call
            lat: geocode?.lat ?? undefined,
            lng: geocode?.lng ?? undefined,
            state: geocode?.state ?? undefined,
            city: geocode?.city ?? undefined,
          }
        }
      );

      if (error) {
        console.error('Error fetching civic officials:', error);
        return {
          officials: [], federalExecutive: [], stateExecutive: [],
          stateLegislative: [], local: [],
          state: null, hasTransitions: false,
        };
      }

      if (data?.error) {
        console.error('Civic API error:', data.error);
        return {
          officials: [], federalExecutive: [], stateExecutive: [],
          stateLegislative: [], local: [],
          state: null, hasTransitions: false,
        };
      }

      console.log(`Fetched ${data?.officials?.length || 0} civic officials`);

      return {
        officials: data?.officials || [],
        federalExecutive: data?.federalExecutive || [],
        stateExecutive: data?.stateExecutive || [],
        stateLegislative: data?.stateLegislative || [],
        local: data?.local || [],
        state: data?.state || null,
        hasTransitions: data?.hasTransitions || false,
      };
    },
    // Wait for geocode to finish before kicking off the civic call
    enabled: !!address && !geocodeQuery.isLoading,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
