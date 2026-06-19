import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface NolanPosition {
  economic: number; // 0–100: higher = more free market
  personal: number; // 0–100: higher = more civil liberties
}

export interface NolanPositionsResult {
  userPosition: NolanPosition;
  partyPositions: Record<string, NolanPosition>;
}

// Answers run –10 (most left) to +10 (most right).
// Economic axis: positive = free market → direct mapping.
// Personal axis: negative = more civil liberties → inverted.
function toEconomicPct(avg: number) { return Math.round(((avg + 10) / 20) * 100); }
function toPersonalPct(avg: number)  { return Math.round(((-avg + 10) / 20) * 100); }

/**
 * Computes Nolan Chart positions for the current user AND all parties,
 * restricted to only the questions the user has answered.
 *
 * Both dots therefore move together as the user answers more questions,
 * keeping the comparison consistent.
 */
export function useNolanPositions() {
  const { user } = useAuth();

  return useQuery<NolanPositionsResult>({
    queryKey: ['nolan-positions', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return { userPosition: { economic: 50, personal: 50 }, partyPositions: {} };
      }

      // Three independent fetches — run in parallel.
      const [userAnswersRes, partyAnswersRes, topicsRes] = await Promise.all([
        supabase
          .from('quiz_answers')
          .select('question_id, value, questions!inner(topic_id)')
          .eq('user_id', user.id),
        supabase
          .from('party_answers')
          .select('party_id, question_id, answer_value'),
        supabase
          .from('topics')
          .select('id, nolan_axis')
          .not('nolan_axis', 'is', null),
      ]);

      if (userAnswersRes.error) throw userAnswersRes.error;
      if (partyAnswersRes.error) throw partyAnswersRes.error;
      if (topicsRes.error) throw topicsRes.error;

      // topic id → axis
      const topicAxis = new Map<string, 'economic' | 'personal'>();
      (topicsRes.data ?? []).forEach(t => {
        if (t.nolan_axis === 'economic' || t.nolan_axis === 'personal') {
          topicAxis.set(t.id, t.nolan_axis);
        }
      });

      // Build question → axis map while accumulating user position sums.
      const questionAxis = new Map<string, 'economic' | 'personal'>();
      let uESum = 0, uEN = 0, uPSum = 0, uPN = 0;

      (userAnswersRes.data ?? []).forEach(row => {
        const topicId = (row.questions as unknown as { topic_id: string })?.topic_id;
        const axis = topicId ? topicAxis.get(topicId) : undefined;
        if (!axis) return;

        questionAxis.set(row.question_id, axis);
        if (axis === 'economic') { uESum += row.value; uEN++; }
        else                      { uPSum += row.value; uPN++; }
      });

      const userPosition: NolanPosition = {
        economic: uEN > 0 ? toEconomicPct(uESum / uEN) : 50,
        personal: uPN > 0 ? toPersonalPct(uPSum / uPN) : 50,
      };

      // Party positions: only on questions the user answered.
      type Acc = { eSum: number; eN: number; pSum: number; pN: number };
      const acc: Record<string, Acc> = {};

      (partyAnswersRes.data ?? []).forEach(row => {
        const axis = questionAxis.get(row.question_id);
        if (!axis) return;

        if (!acc[row.party_id]) acc[row.party_id] = { eSum: 0, eN: 0, pSum: 0, pN: 0 };
        if (axis === 'economic') { acc[row.party_id].eSum += row.answer_value; acc[row.party_id].eN++; }
        else                      { acc[row.party_id].pSum += row.answer_value; acc[row.party_id].pN++; }
      });

      const partyPositions: Record<string, NolanPosition> = {};
      for (const [partyId, s] of Object.entries(acc)) {
        partyPositions[partyId] = {
          economic: s.eN > 0 ? toEconomicPct(s.eSum / s.eN) : 50,
          personal: s.pN > 0 ? toPersonalPct(s.pSum / s.pN) : 50,
        };
      }

      return { userPosition, partyPositions };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });
}
