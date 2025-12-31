import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

interface Source {
  title: string;
  url: string;
  type: string;
}

interface RepComparison {
  id: string;
  user_id: string;
  candidate_id: string;
  summary: string;
  deep_analysis: string | null;
  key_agreements: string[];
  key_disagreements: string[];
  sources: Source[];
  match_score: number | null;
  user_answers_hash: string | null;
  rep_answers_hash: string | null;
  created_at: string;
  updated_at: string;
  deep_analysis_generated_at: string | null;
}

interface UserAnswer {
  question_id: string;
  value: number;
  question_text: string;
  topic_name: string;
}

interface RepAnswer {
  question_id: string;
  value: number;
  source_type: string | null;
  source_url: string | null;
  source_description: string | null;
  question_text: string;
  topic_name: string;
}

// Simple hash function for detecting changes
function hashAnswers(answers: { question_id: string; value: number }[]): string {
  const sorted = [...answers].sort((a, b) => a.question_id.localeCompare(b.question_id));
  return btoa(JSON.stringify(sorted.map(a => `${a.question_id}:${a.value}`)));
}

// Fetch cached comparison from database
export function useRepComparison(candidateId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['rep-comparison', user?.id, candidateId],
    queryFn: async (): Promise<RepComparison | null> => {
      if (!user?.id || !candidateId) return null;

      const { data, error } = await supabase
        .from('user_rep_comparisons')
        .select('*')
        .eq('user_id', user.id)
        .eq('candidate_id', candidateId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching rep comparison:', error);
        return null;
      }

      if (data) {
        return {
          ...data,
          sources: (data.sources as unknown as Source[]) || [],
        };
      }

      return null;
    },
    enabled: !!user?.id && !!candidateId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Generate or update comparison
export function useGenerateRepComparison() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateId,
      candidateName,
      candidateParty,
      candidateOffice,
      userAnswers,
      repAnswers,
      deepAnalysis = false,
    }: {
      candidateId: string;
      candidateName: string;
      candidateParty: string;
      candidateOffice: string;
      userAnswers: UserAnswer[];
      repAnswers: RepAnswer[];
      deepAnalysis?: boolean;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      console.log(`[useGenerateRepComparison] Generating ${deepAnalysis ? 'deep' : 'summary'} for ${candidateName}`);

      // Call edge function to generate comparison
      const { data, error } = await supabase.functions.invoke('generate-rep-comparison', {
        body: {
          candidateId,
          candidateName,
          candidateParty,
          candidateOffice,
          userAnswers,
          repAnswers,
          deepAnalysis,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      // Calculate hashes for cache validation
      const userHash = hashAnswers(userAnswers);
      const repHash = hashAnswers(repAnswers);

      // Upsert to database
      const upsertData: any = {
        user_id: user.id,
        candidate_id: candidateId,
        summary: data.summary,
        key_agreements: data.keyAgreements || [],
        key_disagreements: data.keyDisagreements || [],
        sources: data.sources || [],
        match_score: data.matchScore,
        user_answers_hash: userHash,
        rep_answers_hash: repHash,
        updated_at: new Date().toISOString(),
      };

      if (deepAnalysis && data.deepAnalysis) {
        upsertData.deep_analysis = data.deepAnalysis;
        upsertData.deep_analysis_generated_at = new Date().toISOString();
      }

      const { error: upsertError } = await supabase
        .from('user_rep_comparisons')
        .upsert(upsertData, {
          onConflict: 'user_id,candidate_id',
        });

      if (upsertError) {
        console.error('Error saving comparison:', upsertError);
        // Still return the data even if caching fails
      }

      return {
        ...data,
        candidateId,
      };
    },
    onSuccess: (data) => {
      // Invalidate the specific comparison query
      queryClient.invalidateQueries({ 
        queryKey: ['rep-comparison', user?.id, data.candidateId] 
      });
    },
  });
}

// Check if comparison is stale (user or rep answers changed)
export function isComparisonStale(
  comparison: RepComparison | null,
  userAnswers: { question_id: string; value: number }[],
  repAnswers: { question_id: string; value: number }[]
): boolean {
  if (!comparison) return true;

  const currentUserHash = hashAnswers(userAnswers);
  const currentRepHash = hashAnswers(repAnswers);

  return (
    comparison.user_answers_hash !== currentUserHash ||
    comparison.rep_answers_hash !== currentRepHash
  );
}
