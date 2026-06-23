import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PoliScoreRow {
  key_vote_id: string;
  topic_id: string;
  lean: 'left' | 'right';
  title: string | null;
  neutral_description: string;
  source_url: string;
  vote_position: 'Yea' | 'Nay' | 'Not Voting' | 'Present' | null;
  // Federal-only (null for NC state rows)
  congress: number | null;
  bill_type: string | null;
  bill_number: number | null;
  // NC state-only (null for federal rows)
  bill_id: string | null;
  session: string | null;
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

type Jurisdiction = 'federal' | 'nc_state';

const rpcCall = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>)(fn, args);

export function usePoliScoreRecord(
  candidateId: string | undefined,
  jurisdiction: Jurisdiction = 'federal',
) {
  return useQuery({
    queryKey: ['poliscore-record', candidateId, jurisdiction],
    queryFn: async (): Promise<PoliScoreTopic[]> => {
      if (!candidateId) return [];

      if (jurisdiction === 'nc_state') {
        const { data, error } = await rpcCall('get_poliscore_record_nc', {
          p_candidate_id: candidateId,
        });
        if (error) throw error;
        // NC rows: add null federal fields for type compatibility
        const rows = ((data ?? []) as Array<Omit<PoliScoreRow, 'congress' | 'bill_type' | 'bill_number'>>).map(
          (r) => ({ ...r, congress: null, bill_type: null, bill_number: null }),
        );
        return groupByTopic(rows as PoliScoreRow[]);
      }

      const { data, error } = await rpcCall('get_poliscore_record', {
        p_candidate_id: candidateId,
      });
      if (error) throw error;
      // Federal rows: add null NC fields for type compatibility
      const rows = ((data ?? []) as Array<Omit<PoliScoreRow, 'bill_id' | 'session'>>).map(
        (r) => ({ ...r, bill_id: null, session: null }),
      );
      return groupByTopic(rows as PoliScoreRow[]);
    },
    enabled: !!candidateId,
    staleTime: 1000 * 60 * 30,
  });
}
