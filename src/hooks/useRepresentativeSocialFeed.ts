import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RepresentativeSocialPost {
  id: string;
  representative_slug: string;
  platform: 'x';
  handle: string;
  post_id: string;
  post_url: string;
  post_text: string | null;
  posted_at: string;
}

export const getRepresentativeSlug = (candidateName: string, state?: string | null, district?: string | null) => {
  const normalizedName = candidateName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const statePart = (state || '').toLowerCase();
  const districtPart = (district || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return [normalizedName, statePart, districtPart].filter(Boolean).join('--');
};

export const useRepresentativeSocialFeed = (representativeSlug?: string, limit = 6) => {
  return useQuery({
    queryKey: ['representative-social-feed', representativeSlug, limit],
    enabled: !!representativeSlug,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<RepresentativeSocialPost[]> => {
      const { data, error } = await (supabase as any)
        .from('representative_social_posts')
        .select('id, representative_slug, platform, handle, post_id, post_url, post_text, posted_at')
        .eq('representative_slug', representativeSlug)
        .order('posted_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as RepresentativeSocialPost[];
    },
  });
};
