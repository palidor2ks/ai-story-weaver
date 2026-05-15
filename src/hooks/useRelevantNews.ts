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

export type NewsWindow = 'today' | 'week' | 'month' | 'none';

export interface RelevantNewsResult {
  items: FeedNewsItem[];
  window: NewsWindow;
}

interface Args {
  people: NewsPerson[];
  topics?: string[];
  state?: string;
  district?: string;
  limit?: number;
  enabled?: boolean;
  questionIds?: string[];
}

export const useRelevantNews = ({ people, topics = [], state, district, limit = 20, enabled = true, questionIds = [] }: Args) => {
  const peopleKey = people.map(p => `${p.name}|${p.office || ''}`).sort().join(',');
  const topicsKey = [...topics].sort().join(',');

  return useQuery({
    queryKey: ['relevant-news', peopleKey, topicsKey, state, district, limit, questionIds.slice().sort().join(',')],
    enabled: enabled && people.length > 0,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    queryFn: async (): Promise<RelevantNewsResult> => {
      const { data, error } = await supabase.functions.invoke('fetch-relevant-news', {
        body: { people, topics, state, district, limit, questionIds },
      });
      if (error) throw error;
      return {
        items: (data?.items || []) as FeedNewsItem[],
        window: (data?.window || 'none') as NewsWindow,
      };
    },
  });
};
