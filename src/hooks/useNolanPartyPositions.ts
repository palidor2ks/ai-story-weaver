import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NolanPosition {
  economic: number; // 0–100: higher = more free market / less govt
  personal: number; // 0–100: higher = more civil liberties / less govt
}

export type NolanPartyPositions = Record<string, NolanPosition>;

// Party answer scores run from -10 (most left) to +10 (most right).
// Economic axis: positive = free market = high score → direct mapping.
// Personal axis: negative = more civil liberties = high score → inverted mapping.
function toEconomicPct(avg: number) { return Math.round(((avg + 10) / 20) * 100); }
function toPersonalPct(avg: number)  { return Math.round(((-avg + 10) / 20) * 100); }

export function useNolanPartyPositions() {
  return useQuery<NolanPartyPositions>({
    queryKey: ['nolan-party-positions'],
    queryFn: async () => {
      // Fetch topic axis assignments and party answers in parallel.
      const [topicsRes, answersRes] = await Promise.all([
        supabase
          .from('topics')
          .select('id, nolan_axis')
          .not('nolan_axis', 'is', null),
        supabase
          .from('party_answers')
          .select('party_id, answer_value, questions!inner(topic_id)'),
      ]);

      if (topicsRes.error) throw topicsRes.error;
      if (answersRes.error) throw answersRes.error;

      // Build topic → axis map
      const topicAxis = new Map<string, 'economic' | 'personal'>();
      (topicsRes.data ?? []).forEach(t => {
        if (t.nolan_axis === 'economic' || t.nolan_axis === 'personal') {
          topicAxis.set(t.id, t.nolan_axis);
        }
      });

      // Accumulate sums per party per axis
      type Acc = { eSum: number; eN: number; pSum: number; pN: number };
      const acc: Record<string, Acc> = {};

      (answersRes.data ?? []).forEach(row => {
        const topicId = (row.questions as unknown as { topic_id: string })?.topic_id;
        const axis = topicId ? topicAxis.get(topicId) : undefined;
        if (!axis) return;

        if (!acc[row.party_id]) acc[row.party_id] = { eSum: 0, eN: 0, pSum: 0, pN: 0 };

        if (axis === 'economic') {
          acc[row.party_id].eSum += row.answer_value;
          acc[row.party_id].eN   += 1;
        } else {
          acc[row.party_id].pSum += row.answer_value;
          acc[row.party_id].pN   += 1;
        }
      });

      const positions: NolanPartyPositions = {};
      for (const [partyId, s] of Object.entries(acc)) {
        positions[partyId] = {
          economic: s.eN > 0 ? toEconomicPct(s.eSum / s.eN) : 50,
          personal: s.pN > 0 ? toPersonalPct(s.pSum / s.pN) : 50,
        };
      }

      return positions;
    },
    staleTime: Infinity, // Party answer data changes only when admins update party_answers
  });
}
