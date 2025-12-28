import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DiscoverResult {
  success: boolean;
  cycle: string;
  minSpend: number;
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
  committees: Array<{ id: string; name: string }>;
  message: string;
}

export function useDiscoverSuperPacs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cycle = '2024', minSpend = 100000 }: { cycle?: string; minSpend?: number } = {}) => {
      const { data, error } = await supabase.functions.invoke<DiscoverResult>('discover-super-pacs', {
        body: { cycle, minSpend },
      });

      if (error) {
        throw new Error(error.message || 'Failed to discover Super PACs');
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['external-committees'] });
      queryClient.invalidateQueries({ queryKey: ['pac-donor-counts'] });
      queryClient.invalidateQueries({ queryKey: ['pac-expenditure-summary'] });
      
      if (data?.imported && data.imported > 0) {
        toast.success(`Discovered ${data.discovered} Super PACs`, {
          description: `Imported ${data.imported} new, skipped ${data.skipped} existing`,
        });
      } else if (data?.discovered === 0) {
        toast.info('No new Super PACs found', {
          description: 'All known PACs are already imported',
        });
      } else {
        toast.info(data?.message || 'Discovery complete');
      }
    },
    onError: (error) => {
      console.error('[useDiscoverSuperPacs] Error:', error);
      toast.error('Failed to discover Super PACs', {
        description: error.message,
      });
    },
  });
}
