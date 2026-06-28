import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DonorAliasNameInput {
  name: string;
  type: string;
}

/**
 * Maps a candidate's PAC/Organization donor names to their active canonical
 * alias name (keyed `NAME_UPPER|type`), so donor cards can show the canonical
 * label. Extracted verbatim from CandidateProfile; query key and filtering are
 * unchanged.
 */
export function useDonorAliasNames(inputs: DonorAliasNameInput[]) {
  return useQuery({
    queryKey: ['candidate-donor-alias-names', inputs],
    enabled: inputs.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const names = Array.from(new Set(inputs.map((d) => d.name)));
      const types = Array.from(new Set(inputs.map((d) => d.type)));
      const { data, error } = await supabase
        .from('donor_alias_members')
        .select('donor_name, donor_type, donor_aliases!inner(canonical_name, is_active)')
        .in('donor_name', names)
        .in('donor_type', types);
      if (error) throw error;

      const map = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ donor_name: string; donor_type: string; donor_aliases?: { canonical_name?: string; is_active?: boolean } }>) {
        if (!row.donor_aliases?.is_active || !row.donor_aliases?.canonical_name) continue;
        map.set(`${row.donor_name.trim().toUpperCase()}|${row.donor_type}`, row.donor_aliases.canonical_name);
      }
      return map;
    },
  });
}
