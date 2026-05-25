import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateEntityScore } from '@/lib/scoring';

interface PartyScores {
  democrat: number | null;
  republican: number | null;
  green: number | null;
  libertarian: number | null;
}

/**
 * Overall party score: simple average across ALL questions the party has answered.
 * Not filtered to user's answered questions, not weighted by user's topic priorities.
 * Mirrors what is shown on the party's profile page.
 */
export function usePartyOverallScores() {
  return useQuery<PartyScores>({
    queryKey: ['party-scores-overall'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('party_answers')
        .select('party_id, question_id, answer_value');

      if (error) throw error;

      const byParty = new Map<string, Array<{ question_id: string; answer_value: number }>>();
      (data ?? []).forEach((a) => {
        const arr = byParty.get(a.party_id) ?? [];
        arr.push({ question_id: a.question_id, answer_value: a.answer_value });
        byParty.set(a.party_id, arr);
      });

      const score = (id: string) => calculateEntityScore(byParty.get(id) ?? []);

      return {
        democrat: score('democrat'),
        republican: score('republican'),
        green: score('green'),
        libertarian: score('libertarian'),
      };
    },
    staleTime: 1000 * 60 * 10,
  });
}
