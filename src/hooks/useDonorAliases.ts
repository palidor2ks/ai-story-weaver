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
      const name = (input.canonical_name || '').trim();
      if (!name) throw new Error('Canonical name is required');

      // Case-insensitive dedupe: reuse existing alias if one already exists.
      const { data: existing, error: lookupErr } = await supabase
        .from('donor_aliases')
        .select('*')
        .ilike('canonical_name', name)
        .maybeSingle();
      if (lookupErr && lookupErr.code !== 'PGRST116') throw lookupErr;
      if (existing) {
        return { ...(existing as DonorAlias), __reused: true } as DonorAlias & { __reused?: boolean };
      }

      const { data, error } = await supabase
        .from('donor_aliases')
        .insert({
          canonical_name: name,
          fec_committee_id: input.fec_committee_id || null,
          notes: input.notes || null,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new Error(`Alias "${name}" already exists`);
        }
        throw error;
      }
      return data as DonorAlias;
    },
    onSuccess: (data) => {
      invalidateDonorCaches(queryClient);
      const reused = (data as DonorAlias & { __reused?: boolean }).__reused;
      if (reused) {
        toast.info(`Alias "${data.canonical_name}" already exists — using existing one`);
      } else {
        toast.success('Alias created — now attach donors to make it visible on /donors');
      }
    },
    onError: (error: Error) => toast.error(`Failed to create alias: ${error.message}`),
  });
};

export const useUpdateDonorAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: DonorAliasInput & { id: string }) => {
      const name = (input.canonical_name || '').trim();
      if (!name) throw new Error('Canonical name is required');

      const { data, error } = await supabase
        .from('donor_aliases')
        .update({
          canonical_name: name,
          fec_committee_id: input.fec_committee_id || null,
          notes: input.notes || null,
          is_active: input.is_active ?? true,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new Error(`Another alias named "${name}" already exists`);
        }
        throw error;
      }
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
      // Capture alias details BEFORE deleting so we can unapply pattern-stamped donors.
      const { data: alias } = await supabase
        .from('donor_aliases')
        .select('canonical_name, alias_pattern, alias_patterns, donor_types')
        .eq('id', id)
        .maybeSingle();

      // Get explicit members (for member-based aliases)
      const { data: members } = await supabase
        .from('donor_alias_members')
        .select('donor_name, donor_type')
        .eq('alias_id', id);

      const { error } = await supabase.from('donor_aliases').delete().eq('id', id);
      if (error) throw error;

      // Reset member donors directly
      for (const m of members || []) {
        await supabase
          .from('donors')
          .update({ display_name: m.donor_name })
          .eq('name', m.donor_name)
          .eq('type', m.donor_type as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      }

      // Also unapply any pattern-stamped donors (apply-donor-alias matches by ILIKE
      // pattern and does NOT insert membership rows, so they'd otherwise be orphaned
      // with display_name still set to the deleted alias's canonical_name).
      const a = alias as any;
      const patterns: string[] = (a?.alias_patterns?.length ? a.alias_patterns : [a?.alias_pattern]).filter(Boolean);
      const donorTypes: string[] = a?.donor_types || [];
      if (a?.canonical_name && patterns.length && donorTypes.length) {
        const { error: unErr } = await supabase.functions.invoke('unapply-donor-alias', {
          body: { patterns, donor_types: donorTypes, canonical_name: a.canonical_name },
        });
        if (unErr) console.warn('[delete-alias] unapply failed:', unErr.message);
      }

      // Refresh the donor consolidated MV so the public Donors list immediately
      // stops showing the merged row for the deleted alias.
      const { error: mvErr } = await supabase.rpc('refresh_donor_consolidated_mv');
      if (mvErr) console.warn('[delete-alias] mv refresh failed:', mvErr.message);
    },
    onSuccess: () => {
      invalidateDonorCaches(queryClient);
      toast.success('Alias deleted — Donors list refreshed');
    },
    onError: (error: Error) => toast.error(`Failed to delete alias: ${error.message}`),
  });
};

// Single coalesced MV refresh shared across attach/detach/delete flows.
const refreshDonorMv = async (queryClient: ReturnType<typeof useQueryClient>) => {
  try {
    await supabase.rpc('refresh_donor_consolidated_mv');
  } catch (e) {
    console.warn('[donor-mv] refresh failed:', (e as Error)?.message);
  }
  queryClient.invalidateQueries({ queryKey: ['donors-paginated'] });
  queryClient.invalidateQueries({ queryKey: ['donors-consolidated'] });
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
          body: { alias_id, donors: chunk, skip_mv_refresh: true },
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
      const toastId = toast.loading(`Attached ${data.attached_count} donor(s) — refreshing list…`);
      refreshDonorMv(queryClient).finally(() => {
        toast.success(`Attached ${data.attached_count} donor(s) — Donors list refreshed`, { id: toastId });
      });
    },
    onError: (error: Error) => toast.error(`Failed to attach: ${error.message}`),
  });
};

export const useDetachDonors = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ donors }: { donors: AttachableDonor[] }) => {
      const { data, error } = await supabase.functions.invoke('detach-donors-from-alias', {
        body: { donors, skip_mv_refresh: true },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Detach failed');
      return data;
    },
    onSuccess: (data) => {
      invalidateDonorCaches(queryClient);
      const toastId = toast.loading(`Detached ${data.detached_count} donor(s) — refreshing list…`);
      refreshDonorMv(queryClient).finally(() => {
        toast.success(`Detached ${data.detached_count} donor(s) — Donors list refreshed`, { id: toastId });
      });
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
