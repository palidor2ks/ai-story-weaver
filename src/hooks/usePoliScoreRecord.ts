import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PoliScoreRow {
  key_vote_id: string;
  topic_id: string;
  lean: 'left' | 'right';
  title: string;
  neutral_description: string;
  source_url: string;
  congress: number;
  bill_type: string;
  bill_number: number;
  vote_position: 'Yea' | 'Nay' | 'Not Voting' | 'Present' | null;
}

export interface PoliScoreTopic {
  topic_id: string;
  votes: PoliScoreRow[];
  cast: number;
  onRecord: number;
  leftAligned: number;
  rightAligned: number;
}

const TOPIC_NAMES: Record<string, string> = {
  'economy-work': 'Economy & Work',
  'environment-energy': 'Environment & Energy',
  'government-democracy': 'Government & Democracy',
  'health-safety-net': 'Health, Education & Welfare',
  'national-security-borders': 'National Security & Borders',
  'rights-justice': 'Rights & Justice',
};

export function topicDisplayName(topicId: string): string {
  return TOPIC_NAMES[topicId] ?? topicId;
}

const TOPIC_ORDER = [
  'economy-work',
  'environment-energy',
  'government-democracy',
  'health-safety-net',
  'national-security-borders',
  'rights-justice',
];

function groupByTopic(rows: PoliScoreRow[]): PoliScoreTopic[] {
  const map = new Map<string, PoliScoreRow[]>();
  for (const row of rows) {
    const bucket = map.get(row.topic_id) ?? [];
    bucket.push(row);
    map.set(row.topic_id, bucket);
  }

  const topics: PoliScoreTopic[] = [];
  for (const [topic_id, votes] of map) {
    let cast = 0;
    let leftAligned = 0;
    let rightAligned = 0;
    for (const v of votes) {
      const isSubstantive = v.vote_position === 'Yea' || v.vote_position === 'Nay';
      if (isSubstantive) {
        cast++;
        // right-aligned = Yea on a right-lean vote, or Nay on a left-lean vote
        if (
          (v.lean === 'right' && v.vote_position === 'Yea') ||
          (v.lean === 'left' && v.vote_position === 'Nay')
        ) {
          rightAligned++;
        } else {
          leftAligned++;
        }
      }
    }
    topics.push({ topic_id, votes, cast, onRecord: votes.length, leftAligned, rightAligned });
  }

  topics.sort(
    (a, b) =>
      (TOPIC_ORDER.indexOf(a.topic_id) + 1 || 99) -
      (TOPIC_ORDER.indexOf(b.topic_id) + 1 || 99),
  );
  return topics;
}

export function usePoliScoreRecord(candidateId: string | undefined) {
  return useQuery({
    queryKey: ['poliscore-record', candidateId],
    queryFn: async (): Promise<PoliScoreTopic[]> => {
      if (!candidateId) return [];
      // get_poliscore_record is not yet in the generated Supabase types;
      // use the untyped escape hatch (same pattern as useNjLegislatorFinance).
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('get_poliscore_record', {
        p_candidate_id: candidateId,
      });
      if (error) throw error;
      return groupByTopic((data ?? []) as PoliScoreRow[]);
    },
    enabled: !!candidateId,
    staleTime: 1000 * 60 * 30,
  });
}
