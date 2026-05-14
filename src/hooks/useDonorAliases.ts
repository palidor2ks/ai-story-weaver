import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DonorAlias {
  id: string;
  canonical_name: string;
  alias_pattern: string;
  alias_patterns: string[];
  donor_type: string;
  donor_types: string[];
  fec_committee_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DonorAliasInput {
  canonical_name: string;
  alias_patterns: string[];
  donor_types: string[];
  fec_committee_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export const useDonorAliases = () => {
  return useQuery({
    queryKey: ['donor-aliases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donor_aliases')
        .select('*')
        .order('canonical_name');

      if (error) throw error;
      return data as DonorAlias[];
    },
  });
};

export const useCreateDonorAlias = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DonorAliasInput) => {
      // Include alias_pattern and donor_type for backwards compatibility
      const insertData = {
        canonical_name: input.canonical_name,
        alias_patterns: input.alias_patterns,
        alias_pattern: input.alias_patterns[0] || '',
        donor_types: input.donor_types,
        donor_type: input.donor_types[0] || 'PAC',
        fec_committee_id: input.fec_committee_id,
        notes: input.notes,
        is_active: input.is_active,
      };
      const { data, error } = await supabase
        .from('donor_aliases')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      toast.info('Applying alias to matching donors…');
      const { data: applyData, error: applyError } = await supabase.functions.invoke('apply-donor-alias', {
        body: { alias_id: data.id },
      });
      if (applyError) throw applyError;
      queryClient.invalidateQueries({ queryKey: ['donor-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['donors-consolidated'] });
      queryClient.invalidateQueries({ queryKey: ['donors-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-donors'] });
      toast.success(`Applied to ${applyData?.updated ?? 0} donors`);
    },
    onError: (error) => {
      toast.error(`Failed to create alias: ${error.message}`);
    },
  });
};

export const useUpdateDonorAlias = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: DonorAliasInput & { id: string }) => {
      // Include alias_pattern and donor_type for backwards compatibility
      const updateData = {
        canonical_name: input.canonical_name,
        alias_patterns: input.alias_patterns,
        alias_pattern: input.alias_patterns[0] || '',
        donor_types: input.donor_types,
        donor_type: input.donor_types[0] || 'PAC',
        fec_committee_id: input.fec_committee_id,
        notes: input.notes,
        is_active: input.is_active,
      };
      const { data, error } = await supabase
        .from('donor_aliases')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      toast.info('Applying alias to matching donors…');
      const { data: applyData, error: applyError } = await supabase.functions.invoke('apply-donor-alias', {
        body: { alias_id: data.id },
      });
      if (applyError) throw applyError;
      queryClient.invalidateQueries({ queryKey: ['donor-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['donors-consolidated'] });
      queryClient.invalidateQueries({ queryKey: ['donors-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-donors'] });
      toast.success(`Applied to ${applyData?.updated ?? 0} donors`);
    },
    onError: (error) => {
      toast.error(`Failed to update alias: ${error.message}`);
    },
  });
};

export const useDeleteDonorAlias = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: alias, error: fetchError } = await supabase
        .from('donor_aliases')
        .select('alias_pattern, alias_patterns, donor_types')
        .eq('id', id)
        .single();
      if (fetchError) throw fetchError;

      const patterns = alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern].filter(Boolean);

      const { error } = await supabase
        .from('donor_aliases')
        .delete()
        .eq('id', id);
      if (error) throw error;

      return { patterns, donor_types: alias.donor_types || [] };
    },
    onSuccess: async (payload) => {
      toast.info('Applying alias removal to matching donors…');
      const { data: unapplyData, error: unapplyError } = await supabase.functions.invoke('unapply-donor-alias', {
        body: payload,
      });
      if (unapplyError) throw unapplyError;
      queryClient.invalidateQueries({ queryKey: ['donor-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['donors-consolidated'] });
      queryClient.invalidateQueries({ queryKey: ['donors-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-donors'] });
      toast.success(`Recomputed ${unapplyData?.updated ?? 0} donors after alias removal`);
    },
    onError: (error) => {
      toast.error(`Failed to delete alias: ${error.message}`);
    },
  });
};

export const useMatchingDonorsCount = (patterns: string[], donorTypes: string[]) => {
  return useQuery({
    queryKey: ['matching-donors-count', patterns, donorTypes],
    queryFn: async () => {
      if (!patterns || patterns.length === 0 || !donorTypes || donorTypes.length === 0) return 0;
      
      const validTypes = ['Individual', 'PAC', 'Organization', 'Unknown'] as const;
      const filteredTypes = donorTypes.filter(t => validTypes.includes(t as any));
      if (filteredTypes.length === 0) return 0;
      
      // Use the new RPC function for multi-pattern matching
      const { data, error } = await supabase
        .rpc('count_donors_matching_patterns', {
          patterns: patterns.filter(p => p.trim()),
          p_donor_types: filteredTypes
        });

      if (error) throw error;
      return data || 0;
    },
    enabled: patterns.length > 0 && patterns.some(p => p.trim()) && donorTypes.length > 0,
  });
};
