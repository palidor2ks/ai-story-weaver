import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BadgeDefinition {
  slug: string;
  name: string;
  description: string;
  category: 'onboarding' | 'progress' | 'topic' | 'engagement' | 'social' | 'candidate';
  tier: number | null;
  icon: string | null;
  points: number;
  is_repeatable: boolean;
  priority: number;
}

export interface UserBadge {
  id: string;
  badge_slug: string;
  awarded_at: string;
  metadata: Record<string, unknown>;
}

export function useBadgeCatalog() {
  return useQuery({
    queryKey: ['badge_catalog'],
    queryFn: async (): Promise<BadgeDefinition[]> => {
      const { data, error } = await supabase
        .from('badge_definitions' as never)
        .select('slug,name,description,category,tier,icon,points,is_repeatable,priority')
        .eq('active', true)
        .order('category')
        .order('tier', { nullsFirst: false })
        .order('priority', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BadgeDefinition[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserBadges(userId?: string) {
  return useQuery({
    queryKey: ['user_badges', userId],
    queryFn: async (): Promise<UserBadge[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_badges' as never)
        .select('id,badge_slug,awarded_at,metadata')
        .eq('user_id', userId)
        .order('awarded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as UserBadge[];
    },
    enabled: !!userId,
  });
}
