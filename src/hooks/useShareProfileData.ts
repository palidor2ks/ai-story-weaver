import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { choosePrimaryCauseLabel, type CauseDisplayInfo } from '@/lib/committeeCauseDisplay';

// Resolves a display cause (primary, falling back to secondary) for each top-spender
// committee, for the share card.
export function useShareProfileSpenderCauses(topSpenderIds: string[]) {
  return useQuery({
    queryKey: ['share-profile-spender-causes', topSpenderIds],
    enabled: topSpenderIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase
        .from('committee_topics')
        .select(
          'fec_committee_id, secondary_cause_ids, primary_cause:primary_cause_id(id, label, stance)',
        )
        .in('fec_committee_id', topSpenderIds);
      const rows = (data ?? []) as unknown as Array<{
        fec_committee_id: string | null;
        secondary_cause_ids: string[] | null;
        primary_cause: (CauseDisplayInfo & { stance?: string | null }) | null;
      }>;
      const secondaryIds = Array.from(
        new Set(rows.flatMap((r) => r.secondary_cause_ids ?? [])),
      );
      const { data: secondaryCauses } =
        secondaryIds.length > 0
          ? await supabase
              .from('committee_causes')
              .select('id, label')
              .in('id', secondaryIds)
          : { data: [] };
      const causeRows = (secondaryCauses ?? []) as unknown as CauseDisplayInfo[];
      const causeById = new Map(causeRows.map((cause) => [cause.id, cause]));
      const map = new Map<string, { label: string; stance: string | null }>();
      rows.forEach((r) => {
        if (!r.fec_committee_id) return;
        const label = choosePrimaryCauseLabel(
          r.primary_cause,
          (r.secondary_cause_ids ?? [])
            .map((secondaryId) => causeById.get(secondaryId))
            .filter(Boolean) as CauseDisplayInfo[],
        );
        if (label) {
          map.set(r.fec_committee_id, {
            label,
            stance: r.primary_cause?.stance ?? null,
          });
        }
      });
      return map;
    },
  });
}
