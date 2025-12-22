import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Source of truth for political scores across the app.
 *
 * - Reads scores from `candidates.overall_score` and `candidate_overrides.overall_score`
 * - `candidate_overrides` takes precedence
 */
export const useCandidateScoreMap = (candidateIds?: string[]) => {
  const ids = (candidateIds ?? []).filter(Boolean);
  const hasFilter = ids.length > 0;
  const idsKey = hasFilter ? [...ids].sort().join(',') : 'all';

  return useQuery({
    queryKey: ['candidate-score-map', idsKey],
    queryFn: async () => {
      let overridesQuery = supabase
        .from('candidate_overrides')
        .select('candidate_id, overall_score');

      let candidatesQuery = supabase
        .from('candidates')
        .select('id, overall_score');

      if (hasFilter) {
        overridesQuery = overridesQuery.in('candidate_id', ids);
        candidatesQuery = candidatesQuery.in('id', ids);
      }

      const [{ data: overrides, error: overridesError }, { data: candidates, error: candidatesError }] =
        await Promise.all([overridesQuery, candidatesQuery]);

      if (candidatesError) throw candidatesError;
      if (overridesError) {
        console.error('Error fetching candidate_overrides scores:', overridesError);
      }

      const map = new Map<string, number>();

      (candidates || []).forEach((c) => {
        if (c.overall_score !== null) map.set(c.id, c.overall_score);
      });

      (overrides || []).forEach((o) => {
        if (o.overall_score !== null) map.set(o.candidate_id, o.overall_score);
      });

      return map;
    },
    staleTime: 1000 * 60 * 2,
  });
};
