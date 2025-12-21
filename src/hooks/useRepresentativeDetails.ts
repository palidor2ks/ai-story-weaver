import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Representative, SocialMedia, DistrictOffice } from './useRepresentatives';

interface FetchRepresentativesResponse {
  representatives: Representative[];
  total: number;
  state: string;
  district: string;
  error?: string;
}

/**
 * Fetch full representative details including contact info, social media, and district offices
 * by fetching all reps and finding the one with matching bioguide ID
 */
export function useRepresentativeDetails(bioguideId: string | undefined) {
  return useQuery({
    queryKey: ['representative-details', bioguideId],
    queryFn: async (): Promise<Representative | null> => {
      if (!bioguideId) {
        return null;
      }

      console.log('Fetching representative details for:', bioguideId);

      const { data, error } = await supabase.functions.invoke<FetchRepresentativesResponse>(
        'fetch-representatives',
        {
          body: { fetchAll: true }
        }
      );

      if (error) {
        console.error('Error fetching representative details:', error);
        return null;
      }

      if (data?.error) {
        console.error('API error:', data.error);
        return null;
      }

      // Find the representative with matching bioguide ID
      const rep = data?.representatives?.find(r => r.bioguide_id === bioguideId || r.id === bioguideId);
      
      if (rep) {
        console.log('Found representative details:', rep.name, {
          hasContactInfo: !!(rep.phone || rep.website_url),
          hasSocialMedia: !!rep.social_media,
          hasDistrictOffices: !!(rep.district_offices?.length),
        });
      } else {
        console.log('Representative not found in federal dataset:', bioguideId);
      }

      return rep || null;
    },
    enabled: !!bioguideId,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 1,
  });
}
