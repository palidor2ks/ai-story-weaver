import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Vendor {
  id: string;
  name: string;
  category: string | null;
  notes: string | null;
  is_active: boolean;
}

export function useVendorRefunds() {
  return useQuery({
    queryKey: ['vendor-refund-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_refund_organizations')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data as Vendor[]) || [];
    },
  });
}

// Raw data operations — the panel's useMutation wrappers (which reset form state /
// show toasts) stay in the component and call these.
export function addVendorRefund(input: { name: string; category: string; notes: string | null }) {
  return supabase.from('vendor_refund_organizations').insert(input);
}

export function setVendorRefundActive(id: string, is_active: boolean) {
  return supabase.from('vendor_refund_organizations').update({ is_active }).eq('id', id);
}

export function deleteVendorRefund(id: string) {
  return supabase.from('vendor_refund_organizations').delete().eq('id', id);
}

export function retagVendorRefunds() {
  // retag_vendor_refunds isn't in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).rpc('retag_vendor_refunds');
}
