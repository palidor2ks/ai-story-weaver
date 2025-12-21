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

// Get congressional district using Census Geocoder API
export async function getDistrictFromAddress(address: string): Promise<string | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    // Use layers=all to get all geography data including congressional districts
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddress}&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`;
    
    console.log('Fetching district from Census API for address:', address);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log('Census geocoder request failed with status:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Census API response:', JSON.stringify(data?.result?.addressMatches?.[0]?.geographies, null, 2));
    
    const geographies = data?.result?.addressMatches?.[0]?.geographies;
    
    if (!geographies) {
      console.log('No address matches found in Census response');
      return null;
    }
    
    // Try multiple possible layer names for congressional districts
    const possibleLayers = [
      '119th Congressional Districts',
      '118th Congressional Districts', 
      'Congressional Districts',
      '2024 Congressional Districts',
      '2022 Congressional Districts'
    ];
    
    for (const layer of possibleLayers) {
      const congressionalDistrict = geographies[layer]?.[0];
      if (congressionalDistrict) {
        // Try multiple possible field names for the district number
        const districtNum = congressionalDistrict.CD119 || 
                           congressionalDistrict.CD118 || 
                           congressionalDistrict.CD || 
                           congressionalDistrict.BASENAME ||
                           congressionalDistrict.NAME;
        if (districtNum) {
          // Extract just the number if it's a full name like "Congressional District 6"
          const numMatch = String(districtNum).match(/\d+/);
          const finalDistrict = numMatch ? numMatch[0] : districtNum;
          console.log(`Found congressional district: ${finalDistrict} from layer: ${layer}`);
          return finalDistrict;
        }
      }
    }
    
    // Log available geography layers for debugging
    console.log('Available geography layers:', Object.keys(geographies));
    
    return null;
  } catch (error) {
    console.error('Error getting district from address:', error);
    return null;
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

      const { state } = parseAddressForState(address);
      
      if (!state) {
        console.log('Could not parse state from address:', address);
        return { representatives: [], district: null, state: null };
      }

      // Get the congressional district from the full address
      const district = await getDistrictFromAddress(address);
      console.log(`Fetching representatives for state: ${state}, district: ${district}`);

      const { data, error } = await supabase.functions.invoke<FetchRepresentativesResponse>(
        'fetch-representatives',
        {
          body: { state, district }
        }
      );

      if (error) {
        console.error('Error fetching representatives:', error);
        throw error;
      }

      if (data?.error) {
        console.error('API error:', data.error);
        return { representatives: [], district, state };
      }

      return { 
        representatives: data?.representatives || [], 
        district, 
        state 
      };
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 1,
  });
}
