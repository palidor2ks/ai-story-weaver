import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NewsPerson {
  name: string;
  office?: string;
  state?: string;
  district?: string;
}

export interface FeedNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet?: string;
  matchedPeople: string[];
  matchedTopics: string[];
  relevanceScore: number;
  isTopTopicHit: boolean;
  isNew: boolean;
}

interface Args {
  people: NewsPerson[];
  topics?: string[];
  state?: string;
  district?: string;
  limit?: number;
  enabled?: boolean;
}

export const useRelevantNews = ({ people, topics = [], state, district, limit = 20, enabled = true }: Args) => {
  const peopleKey = people.map(p => `${p.name}|${p.office || ''}`).sort().join(',');
  const topicsKey = [...topics].sort().join(',');

  return useQuery({
    queryKey: ['relevant-news', peopleKey, topicsKey, state, district, limit],
    enabled: enabled && people.length > 0,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    queryFn: async (): Promise<FeedNewsItem[]> => {
      const { data, error } = await supabase.functions.invoke('fetch-relevant-news', {
        body: { people, topics, state, district, limit },
      });
      if (error) throw error;
      return (data?.items || []) as FeedNewsItem[];
    },
  });
};
