import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RepresentativeSocialPost {
  id: string;
  candidate_id: string;
  platform: 'x';
  handle: string;
  post_id: string;
  post_url: string;
  post_text: string | null;
  posted_at: string;
}

export const useRepresentativeSocialFeed = (candidateId?: string, limit = 6) => {
  return useQuery({
    queryKey: ['representative-social-feed', candidateId, limit],
    enabled: !!candidateId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<RepresentativeSocialPost[]> => {
      const { data, error } = await supabase
        .from('representative_social_posts')
        .select('id, candidate_id, platform, handle, post_id, post_url, post_text, posted_at')
        .eq('candidate_id', candidateId!)
        .order('posted_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as RepresentativeSocialPost[];
    },
  });
};
