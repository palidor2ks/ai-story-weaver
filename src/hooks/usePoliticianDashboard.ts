import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PoliticianQuestion {
  id: string;
  text: string;
  topic_id: string;
  topics?: {
    id: string;
    name: string;
  };
}

export interface PoliticianTopic {
  id: string;
  name: string;
  icon: string;
}

// Questions scoped to an official's level (federal/state/local), resolved via the
// topics in that scope.
export function usePoliticianQuestions(officeScope: string | undefined) {
  return useQuery({
    queryKey: ['politician-questions', officeScope],
    enabled: !!officeScope,
    queryFn: async () => {
      const { data: scopedTopics, error: tErr } = await supabase
        .from('topics')
        .select('id')
        .eq('scope', officeScope!);
      if (tErr) throw tErr;
      const topicIds = (scopedTopics || []).map(t => t.id);
      if (topicIds.length === 0) return [] as PoliticianQuestion[];
      const { data, error } = await supabase
        .from('questions')
        .select('id, text, topic_id, topics(id, name)')
        .in('topic_id', topicIds)
        .order('topic_id');

      if (error) throw error;
      return data as PoliticianQuestion[];
    },
  });
}

export function usePoliticianTopics(officeScope: string | undefined) {
  return useQuery({
    queryKey: ['politician-topics', officeScope],
    enabled: !!officeScope,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, icon')
        .eq('scope', officeScope!)
        .order('name');

      if (error) throw error;
      return data as PoliticianTopic[];
    },
  });
}
