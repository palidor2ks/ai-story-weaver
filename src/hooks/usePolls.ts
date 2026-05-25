import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Poll {
  id: string;
  slug: string;
  type: 'mc' | 'scored' | 'mini_quiz';
  title: string;
  description: string | null;
  topic_id: string | null;
  status: 'draft' | 'published' | 'closed';
  og_image_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  share_platforms?: string[] | null;
  auto_post?: boolean | null;
  share_caption?: string | null;
  library_included?: boolean;
}

export type SharePlatform = 'twitter' | 'facebook' | 'linkedin' | 'instagram';

export interface PollDraftQuestion {
  text: string;
  options: { text: string; value: number }[];
}

export const usePolls = () => {
  return useQuery({
    queryKey: ['polls'],
    queryFn: async (): Promise<Poll[]> => {
      const { data, error } = await supabase
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const polls = (data || []) as Poll[];
      if (polls.length === 0) return polls;

      // Determine library-inclusion per poll
      const { data: pqs } = await supabase
        .from('poll_questions')
        .select('poll_id, questions:question_id(include_in_quiz_library)')
        .in('poll_id', polls.map(p => p.id));

      const includedByPoll = new Map<string, boolean>();
      for (const row of (pqs || []) as any[]) {
        const q = row.questions;
        const included = !!q?.include_in_quiz_library;
        if (included) includedByPoll.set(row.poll_id, true);
        else if (!includedByPoll.has(row.poll_id)) includedByPoll.set(row.poll_id, false);
      }
      return polls.map(p => ({ ...p, library_included: includedByPoll.get(p.id) ?? false }));
    },
  });
};

export const usePollBySlug = (slug: string | undefined) => {
  return useQuery({
    queryKey: ['poll', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data: poll, error: pollErr } = await supabase
        .from('polls')
        .select('*')
        .eq('slug', slug!)
        .maybeSingle();
      if (pollErr) throw pollErr;
      if (!poll) return null;

      const { data: pqs, error: pqErr } = await supabase
        .from('poll_questions')
        .select('id, display_order, question_id, questions:question_id(id, text, topic_id, question_options(id, text, value, display_order))')
        .eq('poll_id', poll.id)
        .order('display_order');
      if (pqErr) throw pqErr;

      return { poll: poll as Poll, questions: pqs || [] };
    },
  });
};

export const usePollTally = (pollId: string | undefined) => {
  return useQuery({
    queryKey: ['poll-tally', pollId],
    enabled: !!pollId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_poll_tally', { p_poll_id: pollId! });
      if (error) throw error;
      return (data || []) as { question_id: string; selected_option_id: string; count: number }[];
    },
  });
};

interface CreatePollInput {
  title: string;
  description: string;
  type: 'mc' | 'scored' | 'mini_quiz';
  topic_id?: string | null;
  questions: PollDraftQuestion[];
  status: 'draft' | 'published';
  share_platforms?: SharePlatform[];
  auto_post?: boolean;
  share_caption?: string | null;
  include_in_quiz_library?: boolean;
}

function slugify(s: string) {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'poll'}-${suffix}`;
}

export const useCreatePoll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePollInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const slug = slugify(input.title);
      const now = new Date().toISOString();

      // Insert poll
      const { data: pollRow, error: pollErr } = await supabase
        .from('polls')
        .insert({
          slug,
          type: input.type,
          title: input.title,
          description: input.description || null,
          topic_id: input.topic_id || null,
          status: input.status,
          published_at: input.status === 'published' ? now : null,
          created_by: user.id,
          share_platforms: input.share_platforms || [],
          auto_post: input.auto_post ?? true,
          share_caption: input.share_caption || null,
        } as any)
        .select()
        .single();
      if (pollErr) throw pollErr;

      // Insert questions + options into questions/question_options tables
      for (let i = 0; i < input.questions.length; i++) {
        const q = input.questions[i];
        const qid = `poll-${pollRow.id.slice(0, 8)}-q${i + 1}`;

        const { error: qErr } = await supabase.from('questions').insert({
          id: qid,
          text: q.text,
          topic_id: input.topic_id || 'economy-work', // fallback topic
          source: 'poll',
          include_in_politician_quiz: false,
          include_in_quiz_library: input.include_in_quiz_library ?? false,
        } as any);
        if (qErr) throw qErr;

        const optionRows = q.options.map((o, j) => ({
          id: `${qid}-o${j + 1}`,
          question_id: qid,
          text: o.text,
          value: o.value,
          display_order: j,
        }));
        const { error: oErr } = await supabase.from('question_options').insert(optionRows);
        if (oErr) throw oErr;

        const { error: pqErr } = await supabase.from('poll_questions').insert({
          poll_id: pollRow.id,
          question_id: qid,
          display_order: i,
        });
        if (pqErr) throw pqErr;
      }

      // Auto-post on publish if requested
      if (input.status === 'published' && input.auto_post !== false && (input.share_platforms?.length ?? 0) > 0) {
        try {
          const { data, error } = await supabase.functions.invoke('post-poll-to-social', {
            body: { pollId: pollRow.id, platforms: input.share_platforms },
          });
          if (error) throw error;

          const failedPosts = ((data as any)?.results || []).filter((r: any) => r.status === 'failed');
          if (failedPosts.length > 0) {
            const details = failedPosts
              .map((r: any) => `${r.platform}: ${r.error || 'unknown error'}`)
              .join('; ');
            throw new Error(`Auto-post failed for ${failedPosts.length} platform(s): ${details}`);
          }
        } catch (e) {
          console.warn('auto-post failed', e);
          throw e;
        }
      }

      return pollRow as Poll;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['polls'] });
      toast.success('Poll created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRepostPoll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId, platforms }: { pollId: string; platforms: SharePlatform[] }) => {
      const { data, error } = await supabase.functions.invoke('post-poll-to-social', {
        body: { pollId, platforms },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { results: { platform: string; status: string; url?: string; error?: string }[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['polls'] });
      const ok = data.results.filter(r => r.status === 'success').map(r => r.platform);
      const fail = data.results.filter(r => r.status === 'failed');
      if (ok.length) toast.success(`Posted to ${ok.join(', ')}`);
      fail.forEach(f => toast.error(`${f.platform}: ${f.error}`));
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdatePollStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Poll['status'] }) => {
      const update: any = { status };
      if (status === 'published') update.published_at = new Date().toISOString();
      const { error } = await supabase.from('polls').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['polls'] });
      toast.success('Poll updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePoll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('polls').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['polls'] });
      toast.success('Poll deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useGeneratePollQuestions = () => {
  return useMutation({
    mutationFn: async (input: { prompt: string; type: 'mc' | 'scored' | 'mini_quiz'; topic?: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-poll-questions', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { title: string; description: string; questions: PollDraftQuestion[] };
    },
    onError: (e: Error) => toast.error(`AI draft failed: ${e.message}`),
  });
};

export const useTogglePollLibraryInclusion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId, include }: { pollId: string; include: boolean }) => {
      const { data: pqs, error: pqErr } = await supabase
        .from('poll_questions')
        .select('question_id')
        .eq('poll_id', pollId);
      if (pqErr) throw pqErr;
      const ids = (pqs || []).map((r: any) => r.question_id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('questions')
        .update({ include_in_quiz_library: include } as any)
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['polls'] });
      qc.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Quiz Library inclusion updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
