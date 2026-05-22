import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommitteeTopicRow {
  fec_committee_id: string;
  primary_topic_id: string;
  secondary_topic_ids: string[];
  assigned_by: 'ai' | 'admin';
  ai_confidence: 'low' | 'medium' | 'high' | null;
  ai_reasoning: string | null;
  admin_overridden: boolean;
  updated_at: string;
}

export const useCommitteeTopic = (fecCommitteeId: string | null | undefined) => {
  return useQuery({
    queryKey: ['committee-topic', fecCommitteeId],
    enabled: !!fecCommitteeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('committee_topics')
        .select('*')
        .eq('fec_committee_id', fecCommitteeId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CommitteeTopicRow) ?? null;
    },
  });
};

export const useCommitteeTopicsMap = (fecCommitteeIds: (string | null | undefined)[]) => {
  const ids = Array.from(new Set(fecCommitteeIds.filter(Boolean) as string[])).sort();
  return useQuery({
    queryKey: ['committee-topics-map', ids],
    enabled: ids.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('committee_topics')
        .select('*')
        .in('fec_committee_id', ids);
      if (error) throw error;
      const map = new Map<string, CommitteeTopicRow>();
      ((data ?? []) as CommitteeTopicRow[]).forEach((r) => map.set(r.fec_committee_id, r));
      return map;
    },
  });
};

export const useAllCommitteeTopics = () => {
  return useQuery({
    queryKey: ['committee-topics-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('committee_topics')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommitteeTopicRow[];
    },
  });
};

export const useUpsertCommitteeTopic = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fec_committee_id: string;
      primary_topic_id: string;
      secondary_topic_ids?: string[];
    }) => {
      const { data, error } = await supabase
        .from('committee_topics')
        .upsert({
          fec_committee_id: input.fec_committee_id,
          primary_topic_id: input.primary_topic_id,
          secondary_topic_ids: input.secondary_topic_ids ?? [],
          assigned_by: 'admin',
          admin_overridden: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['committee-topic', vars.fec_committee_id] });
      qc.invalidateQueries({ queryKey: ['committee-topics-all'] });
      qc.invalidateQueries({ queryKey: ['committee-topics-map'] });
    },
  });
};

export const useDeleteCommitteeTopic = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fec_committee_id: string) => {
      const { error } = await supabase
        .from('committee_topics')
        .delete()
        .eq('fec_committee_id', fec_committee_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['committee-topic'] });
      qc.invalidateQueries({ queryKey: ['committee-topics-all'] });
      qc.invalidateQueries({ queryKey: ['committee-topics-map'] });
    },
  });
};
