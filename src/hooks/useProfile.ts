import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

// ============= Types =============

interface Profile {
  id: string;
  name: string;
  email: string | null;
  location: string | null;
  overall_score: number;
  created_at: string;
  updated_at: string;
  address: string | null;
  political_party: string | null;
  age: number | null;
  income: string | null;
  sex: string | null;
  score_version: string;
}

interface TopicScore {
  topic_id: string;
  score: number;
  topics?: {
    name: string;
    icon: string;
  };
}

interface UserTopic {
  topic_id: string;
  weight: number;
  topics?: {
    id: string;
    name: string;
    icon: string;
  };
}

// Typed mutation result for consistency
type SaveResult = { success: true };

// Query key prefixes for consolidated invalidation
const USER_DATA_QUERY_KEYS = ['profile', 'user_topic_scores', 'user_topics', 'has_completed_onboarding'] as const;

// ============= Helper Functions =============

/**
 * Invalidate all user-related queries in one call using a predicate
 */
const invalidateUserQueries = (queryClient: ReturnType<typeof useQueryClient>, userId: string | undefined) => {
  if (!userId) return;
  
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0] as string;
      return USER_DATA_QUERY_KEYS.includes(key as typeof USER_DATA_QUERY_KEYS[number]);
    },
  });
};

/**
 * Standard error handler for mutations - logs and shows toast
 */
const handleMutationError = (error: unknown, context: string) => {
  console.error(`${context} failed:`, error);
  toast.error(
    error instanceof Error 
      ? `${context} failed: ${error.message.slice(0, 80)}`
      : `${context} failed unexpectedly`
  );
};

// ============= Query Hooks =============

export const useProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!user,
  });
};

export const useUserTopicScores = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user_topic_scores', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('user_topic_scores')
        .select(`
          topic_id,
          score,
          topics (name, icon)
        `)
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data as TopicScore[];
    },
    enabled: !!user,
  });
};

export const useUserTopics = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user_topics', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('user_topics')
        .select(`
          topic_id,
          weight,
          topics (id, name, icon)
        `)
        .eq('user_id', user.id)
        .order('weight', { ascending: false });
      
      if (error) throw error;
      return data as UserTopic[];
    },
    enabled: !!user,
  });
};

export const useHasCompletedOnboarding = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['has_completed_onboarding', user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      // Check if user has any quiz answers
      const { data, error } = await supabase
        .from('quiz_answers')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      if (error) throw error;
      return data && data.length > 0;
    },
    enabled: !!user,
  });
};

// ============= Mutation Hooks =============

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
    onError: (error) => handleMutationError(error, 'Profile update'),
  });
};

export const useSaveQuizResults = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<SaveResult, Error, { 
    overallScore: number; 
    topicScores: { topicId: string; score: number }[];
    answers: { questionId: string; selectedOptionId: string; value: number }[];
  }>({
    mutationFn: async ({ overallScore, topicScores, answers }) => {
      if (!user) throw new Error('Not authenticated');

      // Use atomic RPC function for all-or-nothing semantics
      const { error } = await supabase.rpc('save_quiz_results', {
        p_user_id: user.id,
        p_overall_score: overallScore,
        p_topic_scores: topicScores.map(ts => ({
          topicId: ts.topicId,
          score: ts.score,
        })),
        p_answers: answers.map(a => ({
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId,
          value: a.value,
        })),
      });

      if (error) throw error;

      return { success: true };
    },
    onSuccess: () => {
      invalidateUserQueries(queryClient, user?.id);
    },
    onError: (error) => handleMutationError(error, 'Quiz save'),
  });
};

export const useSaveUserTopics = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<SaveResult, Error, string[]>({
    mutationFn: async (topicIds) => {
      if (!user) throw new Error('Not authenticated');

      // Build topics array with weights based on rank order
      // Per PRD: ranks [5, 4, 3, 2, 1] for topics 1-5
      const weights = [5, 4, 3, 2, 1];
      const topicsPayload = topicIds.map((topicId, index) => ({
        topic_id: topicId,
        weight: weights[index] || 1,
      }));

      // Use atomic RPC function for transactional delete + insert
      const { error } = await supabase.rpc('save_user_topics', {
        p_user_id: user.id,
        p_topics: topicsPayload,
      });

      if (error) throw error;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_topics', user?.id] });
    },
    onError: (error) => handleMutationError(error, 'Topic save'),
  });
};

export const useResetOnboarding = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<SaveResult, Error, void>({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Delete quiz answers
      const { error: answersError } = await supabase
        .from('quiz_answers')
        .delete()
        .eq('user_id', user.id);
      
      if (answersError) throw answersError;

      // Delete user topic scores
      const { error: scoresError } = await supabase
        .from('user_topic_scores')
        .delete()
        .eq('user_id', user.id);
      
      if (scoresError) throw scoresError;

      // Delete user topics
      const { error: topicsError } = await supabase
        .from('user_topics')
        .delete()
        .eq('user_id', user.id);
      
      if (topicsError) throw topicsError;

      // Reset overall score in profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ overall_score: 0 })
        .eq('id', user.id);
      
      if (profileError) throw profileError;

      return { success: true };
    },
    onSuccess: () => {
      // Consolidated invalidation for all user data
      invalidateUserQueries(queryClient, user?.id);
    },
    onError: (error) => handleMutationError(error, 'Onboarding reset'),
  });
};
