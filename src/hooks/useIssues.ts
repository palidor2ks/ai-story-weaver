import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface IssueTopic {
  id: string;
  name: string;
  icon: string;
  scope: string;
}

export interface IssuePoll {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  topic_id: string | null;
  published_at: string | null;
}

export function useIssuesTopics() {
  return useQuery({
    queryKey: ['issues', 'topics'],
    queryFn: async (): Promise<IssueTopic[]> => {
      const { data, error } = await supabase
        .from('topics')
        .select('id,name,icon,scope')
        .order('scope', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useIssuesPolls() {
  return useQuery({
    queryKey: ['issues', 'polls'],
    queryFn: async (): Promise<IssuePoll[]> => {
      const { data, error } = await supabase
        .from('polls')
        .select('id,slug,title,description,topic_id,published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
  });
}
