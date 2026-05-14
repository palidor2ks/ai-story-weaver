import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RelevantNewsParams {
  people: string[];
  topics: string[];
  district?: string | null;
  state?: string | null;
  perPerson?: number;
}

export interface RelevantNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
  matchedPeople: string[];
  matchedTopics: string[];
  relevanceScore: number;
  isTopTopicHit: boolean;
  isNew: boolean;
}

export function useRelevantNews(params: RelevantNewsParams, enabled = true) {
  const people = (params.people || []).filter(Boolean);
  const topics = (params.topics || []).filter(Boolean);

  return useQuery({
    queryKey: ['relevant-news', people.join('|'), topics.join('|'), params.district, params.state, params.perPerson],
    enabled: enabled && people.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<RelevantNewsItem[]> => {
      const { data, error } = await supabase.functions.invoke('fetch-relevant-news', {
        body: {
          people,
          topics,
          district: params.district,
          state: params.state,
          perPerson: params.perPerson ?? 3,
        },
      });

      if (error) throw error;
      return (data?.articles || []) as RelevantNewsItem[];
    },
  });
}
