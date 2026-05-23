// NOTE: Filename kept for stability. Conceptually this is now "committee causes"
// (Pro-Israel, Pro-gun, etc.) — not the 17 quiz topics. Each cause maps to a
// quiz topic via `committee_causes.quiz_topic_id`.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommitteeCause {
  id: string;
  label: string;
  stance: 'pro' | 'anti' | 'neutral';
  issue: string;
  quiz_topic_id: string;
  description: string | null;
  aliases: string[];
  status: 'active' | 'pending' | 'rejected';
  created_by: 'seed' | 'ai' | 'admin';
  ai_reasoning: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommitteeTopicRow {
  fec_committee_id: string;
  primary_cause_id: string;
  secondary_cause_ids: string[];
  assigned_by: 'ai' | 'admin';
  ai_confidence: 'low' | 'medium' | 'high' | null;
  ai_reasoning: string | null;
  admin_overridden: boolean;
  updated_at: string;
}

export const useCommitteeCauses = (includePending = false) => {
  return useQuery({
    queryKey: ['committee-causes', includePending],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const q = supabase.from('committee_causes').select('*').order('issue').order('label');
      const { data, error } = includePending ? await q : await q.eq('status', 'active');
      if (error) throw error;
      return (data ?? []) as unknown as CommitteeCause[];
    },
  });
};

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
      return (data as unknown as CommitteeTopicRow) ?? null;
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
      ((data ?? []) as unknown as CommitteeTopicRow[]).forEach((r) => map.set(r.fec_committee_id, r));
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
      return ((data ?? []) as unknown as CommitteeTopicRow[]);
    },
  });
};

export const useUpsertCommitteeTopic = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fec_committee_id: string;
      primary_cause_id: string;
      secondary_cause_ids?: string[];
    }) => {
      const { data, error } = await supabase
        .from('committee_topics')
        .upsert({
          fec_committee_id: input.fec_committee_id,
          primary_cause_id: input.primary_cause_id,
          secondary_cause_ids: input.secondary_cause_ids ?? [],
          assigned_by: 'admin',
          admin_overridden: true,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['committee-topic', vars.fec_committee_id] });
      qc.invalidateQueries({ queryKey: ['committee-topics-all'] });
      qc.invalidateQueries({ queryKey: ['committee-topics-map'] });
      qc.refetchQueries({ queryKey: ['committee-pool'], type: 'active' });
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
      qc.refetchQueries({ queryKey: ['committee-pool'], type: 'active' });
    },
  });
};

export const useUpsertCommitteeCause = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CommitteeCause> & { id: string; label: string; stance: string; issue: string; quiz_topic_id: string }) => {
      const { data, error } = await supabase
        .from('committee_causes')
        .upsert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['committee-causes'] });
    },
  });
};

export const useDeleteCommitteeCause = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('committee_causes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['committee-causes'] }),
  });
};
