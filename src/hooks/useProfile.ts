import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

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
  });
};

export const useSaveQuizResults = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      overallScore, 
      topicScores, 
      answers 
    }: { 
      overallScore: number; 
      topicScores: { topicId: string; score: number }[];
      answers: { questionId: string; selectedOptionId: string; value: number }[];
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Update overall score in profile with score version
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          overall_score: overallScore,
          score_version: 'v1.0'
        })
        .eq('id', user.id);
      
      if (profileError) throw profileError;

      // Upsert topic scores
      for (const ts of topicScores) {
        const { error } = await supabase
          .from('user_topic_scores')
          .upsert({
            user_id: user.id,
            topic_id: ts.topicId,
            score: ts.score,
          }, { onConflict: 'user_id,topic_id' });
        
        if (error) throw error;
      }

      // Save quiz answers
      for (const answer of answers) {
        const { error } = await supabase
          .from('quiz_answers')
          .upsert({
            user_id: user.id,
            question_id: answer.questionId,
            selected_option_id: answer.selectedOptionId,
            value: answer.value,
          }, { onConflict: 'user_id,question_id' });
        
        if (error) throw error;
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user_topic_scores', user?.id] });
    },
  });
};

export const useSaveUserTopics = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (topicIds: string[]) => {
      if (!user) throw new Error('Not authenticated');

      // Delete existing topics
      const { error: deleteError } = await supabase
        .from('user_topics')
        .delete()
        .eq('user_id', user.id);
      
      if (deleteError) throw deleteError;

      // Insert new topics with weights based on rank order
      // Per PRD: ranks [5, 4, 3, 2, 1] for topics 1-5
      if (topicIds.length > 0) {
        const weights = [5, 4, 3, 2, 1];
        const { error: insertError } = await supabase
          .from('user_topics')
          .insert(topicIds.map((topicId, index) => ({
            user_id: user.id,
            topic_id: topicId,
            weight: weights[index] || 1,
          })));
        
        if (insertError) throw insertError;
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_topics', user?.id] });
    },
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

export const useResetOnboarding = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
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
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user_topic_scores', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user_topics', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['has_completed_onboarding', user?.id] });
    },
  });
};
