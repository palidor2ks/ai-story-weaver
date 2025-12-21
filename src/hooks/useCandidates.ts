import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CandidateTopicScore {
  topic_id: string;
  score: number;
  topics?: {
    name: string;
    icon: string;
  };
}

interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  state: string;
  district: string | null;
  image_url: string | null;
  overall_score: number;
  last_updated: string;
  topicScores?: CandidateTopicScore[];
}

interface Donor {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  cycle: string;
}

interface Vote {
  id: string;
  bill_id: string;
  bill_name: string;
  date: string;
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting';
  topic: string;
  description: string | null;
}

export const useCandidates = () => {
  return useQuery({
    queryKey: ['candidates'],
    queryFn: async () => {
      const { data: candidates, error } = await supabase
        .from('candidates')
        .select('*')
        .order('name');
      
      if (error) throw error;

      // Fetch topic scores for all candidates
      const { data: topicScores, error: scoresError } = await supabase
        .from('candidate_topic_scores')
        .select(`
          candidate_id,
          topic_id,
          score,
          topics (name, icon)
        `);
      
      if (scoresError) throw scoresError;

      // Map topic scores to candidates
      const candidatesWithScores = candidates.map(candidate => ({
        ...candidate,
        topicScores: topicScores
          ?.filter(ts => ts.candidate_id === candidate.id)
          .map(ts => ({
            topic_id: ts.topic_id,
            score: ts.score,
            topics: ts.topics,
          })) || [],
      }));

      return candidatesWithScores as Candidate[];
    },
  });
};

export const useCandidate = (id: string | undefined) => {
  return useQuery({
    queryKey: ['candidate', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data: candidate, error } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      if (!candidate) return null;

      // Fetch topic scores
      const { data: topicScores, error: scoresError } = await supabase
        .from('candidate_topic_scores')
        .select(`
          topic_id,
          score,
          topics (name, icon)
        `)
        .eq('candidate_id', id);
      
      if (scoresError) throw scoresError;

      return {
        ...candidate,
        topicScores: topicScores?.map(ts => ({
          topic_id: ts.topic_id,
          score: ts.score,
          topics: ts.topics,
        })) || [],
      } as Candidate;
    },
    enabled: !!id,
  });
};

export const useCandidateDonors = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['donors', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('amount', { ascending: false });
      
      if (error) throw error;
      return data as Donor[];
    },
    enabled: !!candidateId,
  });
};

export const useCandidateVotes = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['votes', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data as Vote[];
    },
    enabled: !!candidateId,
  });
};

export const useTopics = () => {
  return useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });
};

export const useQuestions = () => {
  return useQuery({
    queryKey: ['questions'],
    queryFn: async () => {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*');
      
      if (error) throw error;

      // Fetch options for all questions
      const { data: options, error: optionsError } = await supabase
        .from('question_options')
        .select('*')
        .order('display_order');
      
      if (optionsError) throw optionsError;

      // Map options to questions
      return questions.map(q => ({
        ...q,
        options: options?.filter(o => o.question_id === q.id) || [],
      }));
    },
  });
};

export const calculateMatchScore = (userScore: number, candidateScore: number): number => {
  const userNormalized = userScore + 100;
  const candidateNormalized = candidateScore + 100;
  const difference = Math.abs(userNormalized - candidateNormalized);
  const matchPercentage = Math.round(100 - (difference / 2));
  return Math.max(0, Math.min(100, matchPercentage));
};
