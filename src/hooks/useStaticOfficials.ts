import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StaticOfficial {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  level: 'federal_executive' | 'state_executive' | 'state_legislative' | 'local';
  state: string;
  district?: string;
  image_url?: string;
  website_url?: string;
  is_active: boolean;
  coverage_tier: string;
  confidence: string;
  created_at?: string;
  updated_at?: string;
}

export function useStaticOfficials() {
  return useQuery({
    queryKey: ['static-officials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('static_officials')
        .select('*')
        .order('level')
        .order('office')
        .order('name');

      if (error) throw error;
      return data as StaticOfficial[];
    },
  });
}

export function useCreateStaticOfficial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (official: Omit<StaticOfficial, 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('static_officials')
        .insert(official)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['static-officials'] });
      toast.success('Official added successfully');
    },
    onError: (error) => {
      toast.error(`Failed to add official: ${error.message}`);
    },
  });
}

export function useUpdateStaticOfficial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<StaticOfficial> & { id: string }) => {
      const { data, error } = await supabase
        .from('static_officials')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['static-officials'] });
      toast.success('Official updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update official: ${error.message}`);
    },
  });
}

export function useDeleteStaticOfficial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('static_officials')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['static-officials'] });
      toast.success('Official deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete official: ${error.message}`);
    },
  });
}
