import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SocialMedia {
  twitter?: string;
  facebook?: string;
  youtube?: string;
  instagram?: string;
}

export interface DistrictOffice {
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  fax?: string;
  building?: string;
  suite?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
}

export interface Representative {
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
  // Contact info
  website_url?: string | null;
  phone?: string | null;
  address?: string | null;
  contact_form?: string | null;
  fax?: string | null;
  rss_url?: string | null;
  dc_office?: string | null;
  // Social media
  social_media?: SocialMedia | null;
  // District offices
  district_offices?: DistrictOffice[] | null;
}

interface FetchRepresentativesResponse {
  representatives: Representative[];
  total: number;
  state: string;
  district: string;
  error?: string;
}

interface RepresentativesResult {
  representatives: Representative[];
  district: string | null;
  state: string | null;
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

// Get congressional district using edge function (avoids CORS issues with Census API)
export async function getDistrictFromAddress(address: string): Promise<{ district: string | null; state: string | null }> {
  try {
    console.log('Geocoding address via edge function:', address);
    
    const { data, error } = await supabase.functions.invoke<{ district: string | null; state: string | null; matchedAddress?: string; error?: string }>(
      'geocode-address',
      { body: { address } }
    );
    
    if (error) {
      console.error('Geocode edge function error:', error);
      return { district: null, state: null };
    }
    
    if (data?.error) {
      console.log('Geocode API error:', data.error);
    }
    
    console.log('Geocode result:', data);
    return { district: data?.district ?? null, state: data?.state ?? null };
  } catch (error) {
    console.error('Error getting district from address:', error);
    return { district: null, state: null };
  }
}

export function useRepresentatives(address: string | null | undefined) {
  return useQuery({
    queryKey: ['representatives', address],
    queryFn: async (): Promise<RepresentativesResult> => {
      if (!address) {
        console.log('No address provided');
        return { representatives: [], district: null, state: null };
      }

      // Get state and district from the geocode edge function
      const { district, state } = await getDistrictFromAddress(address);
      
      // Fallback to parsing state from address if geocode didn't return it
      const parsedState = state || parseAddressForState(address).state;
      
      if (!parsedState) {
        console.log('Could not determine state from address:', address);
        return { representatives: [], district: null, state: null };
      }

      console.log(`Fetching representatives for state: ${parsedState}, district: ${district}`);

      const { data, error } = await supabase.functions.invoke<FetchRepresentativesResponse>(
        'fetch-representatives',
        {
          body: { state: parsedState, district, includeExecutives: true }
        }
      );

      if (error) {
        console.error('Error fetching representatives:', error);
        throw error;
      }

      if (data?.error) {
        console.error('API error:', data.error);
        return { representatives: [], district, state: parsedState };
      }

      return { 
        representatives: data?.representatives || [], 
        district, 
        state: parsedState 
      };
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 1,
  });
}
