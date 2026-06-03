import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// New Jersey (ELEC) donors are surfaced in the donor list with synthetic ids of
// the form `njc:<contrib_s>`. They live in nj_elec_contributions rather than the
// federal `donors` table, so their profile is resolved via the get_nj_donor_profile
// RPC (see supabase/migrations/20260603232000_nj_donor_profile_rpc.sql).

export interface NjDonorRecipient {
  entity_s: string;
  recipient_name: string;
  office: string | null;
  party: string | null;
  location: string | null;
  amount: number;
  contribution_count: number;
  last_year: number | null;
}

export interface NjDonorContribution {
  contrib_s: number;
  cont_date: string | null;
  election_year: number | null;
  entity_s: string;
  recipient_name: string;
  office: string | null;
  party: string | null;
  amount: number;
}

export interface NjDonorProfileData {
  found: boolean;
  id?: string;
  state_code?: string;
  source?: string;
  name?: string;
  raw_name?: string;
  type?: string;
  city?: string | null;
  state?: string | null;
  employer?: string | null;
  occupation?: string | null;
  total_amount?: number;
  transaction_count?: number;
  recipient_count?: number;
  cycles?: number[];
  recipients?: NjDonorRecipient[];
  contributions?: NjDonorContribution[];
}

/** True for ids that belong to the NJ state-finance source (e.g. `njc:1730941`). */
export const isNjDonorId = (id?: string | null): boolean => !!id && id.startsWith('njc:');

export const useNjDonorProfile = (id?: string) => {
  return useQuery({
    queryKey: ['nj-donor-profile', id],
    queryFn: async (): Promise<NjDonorProfileData> => {
      // get_nj_donor_profile isn't in the generated Supabase types yet. Type the
      // call via `unknown` (not `any`) so it satisfies the lint gate.
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: { p_id?: string },
      ) => Promise<{ data: NjDonorProfileData | null; error: { message: string } | null }>;
      const { data, error } = await rpc('get_nj_donor_profile', { p_id: id });
      if (error) throw error;
      return data ?? { found: false };
    },
    enabled: isNjDonorId(id),
  });
};
