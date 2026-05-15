import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DonorAlias {
  id: string;
  canonical_name: string;
  fec_committee_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DonorAliasInput {
  canonical_name: string;
  fec_committee_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface DonorAliasMember {
  id: string;
  alias_id: string;
  donor_name: string;
  donor_type: string;
  created_at: string;
}

export interface AttachableDonor {
  name: string;
  type: string;
}

const invalidateDonorCaches = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['donor-aliases'] });
  qc.invalidateQueries({ queryKey: ['donor-alias-members'] });
  qc.invalidateQueries({ queryKey: ['donor-alias-for'] });
  qc.invalidateQueries({ queryKey: ['donor-alias-info'] });
  qc.invalidateQueries({ queryKey: ['donors-consolidated'] });
  qc.invalidateQueries({ queryKey: ['donors-paginated'] });
  qc.invalidateQueries({ queryKey: ['candidate-donors'] });
  qc.invalidateQueries({ queryKey: ['donor-search'] });
  qc.invalidateQueries({ queryKey: ['donor-records'] });
  qc.invalidateQueries({ queryKey: ['donor-name-variations'] });
};

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

export const useAliasMemberCounts = () => {
  return useQuery({
    queryKey: ['donor-alias-member-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donor_alias_members')
        .select('alias_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((m: { alias_id: string }) => {
        counts[m.alias_id] = (counts[m.alias_id] || 0) + 1;
      });
      return counts;
    },
  });
};

export const useAliasMembers = (aliasId: string | null | undefined) => {
  return useQuery({
    queryKey: ['donor-alias-members', aliasId],
    queryFn: async () => {
      if (!aliasId) return [] as DonorAliasMember[];
      const { data, error } = await supabase
        .from('donor_alias_members')
        .select('*')
        .eq('alias_id', aliasId)
        .order('donor_name');
      if (error) throw error;
      return (data || []) as DonorAliasMember[];
    },
    enabled: !!aliasId,
  });
};

export const useCreateDonorAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DonorAliasInput) => {
      const { data, error } = await supabase
        .from('donor_aliases')
        .insert({
          canonical_name: input.canonical_name,
          fec_committee_id: input.fec_committee_id || null,
          notes: input.notes || null,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DonorAlias;
    },
    onSuccess: () => {
      invalidateDonorCaches(queryClient);
      toast.success('Alias created');
    },
    onError: (error: Error) => toast.error(`Failed to create alias: ${error.message}`),
  });
};

export const useUpdateDonorAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: DonorAliasInput & { id: string }) => {
      const { data, error } = await supabase
        .from('donor_aliases')
        .update({
          canonical_name: input.canonical_name,
          fec_committee_id: input.fec_committee_id || null,
          notes: input.notes || null,
          is_active: input.is_active ?? true,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as DonorAlias;
    },
    onSuccess: () => {
      invalidateDonorCaches(queryClient);
      toast.success('Alias updated');
    },
    onError: (error: Error) => toast.error(`Failed to update alias: ${error.message}`),
  });
};

export const useDeleteDonorAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Get all member donor names so we can reset their display_name
      const { data: members } = await supabase
        .from('donor_alias_members')
        .select('donor_name, donor_type')
        .eq('alias_id', id);

      const { error } = await supabase.from('donor_aliases').delete().eq('id', id);
      if (error) throw error;

      // Reset display_name for orphaned donors
      for (const m of members || []) {
        await supabase
          .from('donors')
          .update({ display_name: m.donor_name })
          .eq('name', m.donor_name)
          .eq('type', m.donor_type as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      }
    },
    onSuccess: () => {
      invalidateDonorCaches(queryClient);
      toast.success('Alias deleted');
    },
    onError: (error: Error) => toast.error(`Failed to delete alias: ${error.message}`),
  });
};

export const useAttachDonors = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ alias_id, donors }: { alias_id: string; donors: AttachableDonor[] }) => {
      const CHUNK = 100;
      let attached_count = 0;
      let donors_updated = 0;
      const errors: string[] = [];
      for (let i = 0; i < donors.length; i += CHUNK) {
        const chunk = donors.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke('attach-donors-to-alias', {
          body: { alias_id, donors: chunk },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Attach failed');
        attached_count += data.attached_count || 0;
        donors_updated += data.donors_updated || 0;
        if (Array.isArray(data.errors)) errors.push(...data.errors);
      }
      return { success: true, attached_count, donors_updated, errors };
    },
    onSuccess: (data) => {
      invalidateDonorCaches(queryClient);
      toast.success(`Attached ${data.attached_count} donor(s)`);
    },
    onError: (error: Error) => toast.error(`Failed to attach: ${error.message}`),
  });
};

export const useDetachDonors = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ donors }: { donors: AttachableDonor[] }) => {
      const { data, error } = await supabase.functions.invoke('detach-donors-from-alias', {
        body: { donors },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Detach failed');
      return data;
    },
    onSuccess: (data) => {
      invalidateDonorCaches(queryClient);
      toast.success(`Detached ${data.detached_count} donor(s)`);
    },
    onError: (error: Error) => toast.error(`Failed to detach: ${error.message}`),
  });
};

// Lookup: which alias (if any) is this donor attached to?
export const useDonorAliasLookup = (donorName: string, donorType: string) => {
  return useQuery({
    queryKey: ['donor-alias-for', donorName, donorType],
    queryFn: async () => {
      if (!donorName || !donorType) return null;
      const { data, error } = await supabase
        .from('donor_alias_members')
        .select('alias_id, donor_aliases!inner(*)')
        .eq('donor_name', donorName)
        .eq('donor_type', donorType)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return (data as { donor_aliases: DonorAlias }).donor_aliases;
    },
    enabled: !!donorName && !!donorType,
  });
};
