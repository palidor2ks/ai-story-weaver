import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

interface Source {
  title: string;
  url: string;
  type: string;
}

interface PartyComparison {
  id: string;
  user_id: string;
  party_id: string;
  summary: string;
  deep_analysis: string | null;
  key_agreements: string[];
  key_disagreements: string[];
  sources: Source[];
  match_score: number | null;
  user_answers_hash: string | null;
  party_answers_hash: string | null;
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

interface PartyAnswer {
  question_id: string;
  value: number;
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
export function usePartyComparison(partyId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['party-comparison', user?.id, partyId],
    queryFn: async (): Promise<PartyComparison | null> => {
      if (!user?.id || !partyId) return null;

      const { data, error } = await supabase
        .from('user_party_comparisons')
        .select('*')
        .eq('user_id', user.id)
        .eq('party_id', partyId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching party comparison:', error);
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
    enabled: !!user?.id && !!partyId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Generate or update comparison
export function useGeneratePartyComparison() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      partyId,
      partyName,
      userAnswers,
      partyAnswers,
      deepAnalysis = false,
    }: {
      partyId: string;
      partyName: string;
      userAnswers: UserAnswer[];
      partyAnswers: PartyAnswer[];
      deepAnalysis?: boolean;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      console.log(`[useGeneratePartyComparison] Generating ${deepAnalysis ? 'deep' : 'summary'} for ${partyName}`);

      // Call edge function to generate comparison
      const { data, error } = await supabase.functions.invoke('generate-party-comparison', {
        body: {
          partyId,
          partyName,
          userAnswers,
          partyAnswers,
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
      const partyHash = hashAnswers(partyAnswers);

      const { error: upsertError } = await supabase
        .from('user_party_comparisons')
        .upsert({
          user_id: user.id,
          party_id: partyId,
          summary: data.summary,
          key_agreements: data.keyAgreements || [],
          key_disagreements: data.keyDisagreements || [],
          sources: data.sources || [],
          match_score: data.matchScore,
          user_answers_hash: userHash,
          party_answers_hash: partyHash,
          updated_at: new Date().toISOString(),
          ...(deepAnalysis && data.deepAnalysis ? {
            deep_analysis: data.deepAnalysis,
            deep_analysis_generated_at: new Date().toISOString(),
          } : {}),
        }, {
          onConflict: 'user_id,party_id',
        });

      if (upsertError) {
        console.error('Error saving party comparison:', upsertError);
      }

      return {
        ...data,
        partyId,
      };
    },
    onSuccess: (data) => {
      // Invalidate the specific comparison query
      queryClient.invalidateQueries({ 
        queryKey: ['party-comparison', user?.id, data.partyId] 
      });
    },
  });
}

// Check if comparison is stale (user or party answers changed)
export function isPartyComparisonStale(
  comparison: PartyComparison | null,
  userAnswers: { question_id: string; value: number }[],
  partyAnswers: { question_id: string; value: number }[]
): boolean {
  if (!comparison) return true;

  const currentUserHash = hashAnswers(userAnswers);
  const currentPartyHash = hashAnswers(partyAnswers);

  return (
    comparison.user_answers_hash !== currentUserHash ||
    comparison.party_answers_hash !== currentPartyHash
  );
}
