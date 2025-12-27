import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DonorAlias {
  id: string;
  canonical_name: string;
  alias_pattern: string;
  donor_type: string;
  fec_committee_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DonorAliasInput {
  canonical_name: string;
  alias_pattern: string;
  donor_type: string;
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
      const { data, error } = await supabase
        .from('donor_aliases')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['donors-consolidated'] });
      toast.success('Donor alias created');
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
      const { data, error } = await supabase
        .from('donor_aliases')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['donors-consolidated'] });
      toast.success('Donor alias updated');
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
      const { error } = await supabase
        .from('donor_aliases')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['donors-consolidated'] });
      toast.success('Donor alias deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete alias: ${error.message}`);
    },
  });
};

export const useMatchingDonorsCount = (pattern: string, donorType: string) => {
  return useQuery({
    queryKey: ['matching-donors-count', pattern, donorType],
    queryFn: async () => {
      if (!pattern || !donorType) return 0;
      
      const validTypes = ['Individual', 'PAC', 'Organization', 'Unknown'] as const;
      const typeValue = validTypes.find(t => t === donorType);
      if (!typeValue) return 0;
      
      const { count, error } = await supabase
        .from('donors')
        .select('*', { count: 'exact', head: true })
        .eq('type', typeValue)
        .ilike('name', pattern);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!pattern && !!donorType,
  });
};
