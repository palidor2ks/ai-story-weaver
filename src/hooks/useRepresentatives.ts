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

interface FetchRepresentativesResponse {
  representatives: Representative[];
  total: number;
  state: string;
  district: string;
  error?: string;
}

// Parse address to extract state and district
export function parseAddressForState(address: string): { state: string | null; zipCode: string | null } {
  // Common state abbreviations
  const stateAbbreviations = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];

  // Try to find state abbreviation in address
  const upperAddress = address.toUpperCase();
  let foundState: string | null = null;
  
  for (const state of stateAbbreviations) {
    // Look for state abbreviation surrounded by spaces, commas, or at end
    const patterns = [
      new RegExp(`\\b${state}\\s+\\d{5}`, 'i'), // "NJ 08854"
      new RegExp(`,\\s*${state}\\b`, 'i'),       // ", NJ"
      new RegExp(`\\s${state}\\s`, 'i'),         // " NJ "
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(upperAddress)) {
        foundState = state;
        break;
      }
    }
    if (foundState) break;
  }

  // Extract zip code
  const zipMatch = address.match(/\b(\d{5})(-\d{4})?\b/);
  const zipCode = zipMatch ? zipMatch[1] : null;

  return { state: foundState, zipCode };
}

// Map zip code to congressional district (simplified - in production would use Census API)
export async function getDistrictFromZip(zipCode: string): Promise<string | null> {
  // This is a simplified mapping - in production, you'd use the Census Geocoder API
  // For now, return null and rely on showing all representatives for the state
  return null;
}

export function useRepresentatives(address: string | null | undefined) {
  return useQuery({
    queryKey: ['representatives', address],
    queryFn: async (): Promise<Representative[]> => {
      if (!address) {
        console.log('No address provided');
        return [];
      }

      const { state, zipCode } = parseAddressForState(address);
      
      if (!state) {
        console.log('Could not parse state from address:', address);
        return [];
      }

      console.log(`Fetching representatives for state: ${state}`);

      const { data, error } = await supabase.functions.invoke<FetchRepresentativesResponse>(
        'fetch-representatives',
        {
          body: { state, district: null }
        }
      );

      if (error) {
        console.error('Error fetching representatives:', error);
        throw error;
      }

      if (data?.error) {
        console.error('API error:', data.error);
        return [];
      }

      return data?.representatives || [];
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 1,
  });
}
