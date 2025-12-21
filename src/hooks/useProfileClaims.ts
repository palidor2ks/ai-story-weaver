import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

export interface ProfileClaim {
  id: string;
  candidate_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  verification_info: string | null;
  official_email: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch current user's claims
export function useMyProfileClaims() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-profile-claims', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('profile_claims')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ProfileClaim[];
    },
    enabled: !!user?.id,
  });
}

// Check if current user has a claim for a specific candidate
export function useMyClaimForCandidate(candidateId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-claim-for-candidate', candidateId, user?.id],
    queryFn: async () => {
      if (!user?.id || !candidateId) return null;

      const { data, error } = await supabase
        .from('profile_claims')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as ProfileClaim | null;
    },
    enabled: !!user?.id && !!candidateId,
  });
}

// Admin: fetch all pending claims
export function usePendingClaims() {
  return useQuery({
    queryKey: ['pending-claims'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_claims')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ProfileClaim[];
    },
  });
}

// Admin: fetch all claims
export function useAllClaims() {
  return useQuery({
    queryKey: ['all-claims'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_claims')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ProfileClaim[];
    },
  });
}

// Submit a new claim
export function useSubmitClaim() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      candidateId,
      verificationInfo,
      officialEmail,
    }: {
      candidateId: string;
      verificationInfo: string;
      officialEmail: string;
    }) => {
      if (!user?.id) throw new Error('Must be logged in to submit a claim');

      const { data, error } = await supabase
        .from('profile_claims')
        .insert({
          candidate_id: candidateId,
          user_id: user.id,
          verification_info: verificationInfo,
          official_email: officialEmail,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-claims'] });
      queryClient.invalidateQueries({ queryKey: ['my-claim-for-candidate'] });
      toast.success('Claim submitted! An admin will review your request.');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit claim: ${error.message}`);
    },
  });
}

// Admin: approve a claim
export function useApproveClaim() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (claimId: string) => {
      if (!user?.id) throw new Error('Must be logged in');

      // 1. Get the claim details
      const { data: claim, error: claimError } = await supabase
        .from('profile_claims')
        .select('*')
        .eq('id', claimId)
        .single();

      if (claimError) throw claimError;

      // 2. Update the claim status
      const { error: updateClaimError } = await supabase
        .from('profile_claims')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', claimId);

      if (updateClaimError) throw updateClaimError;

      // 3. Update the candidate's claimed_by_user_id
      const { error: updateCandidateError } = await supabase
        .from('candidates')
        .update({
          claimed_by_user_id: claim.user_id,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', claim.candidate_id);

      if (updateCandidateError) throw updateCandidateError;

      // 4. Add politician role to the user
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: claim.user_id,
          role: 'politician',
        });

      // Ignore duplicate role errors
      if (roleError && !roleError.message.includes('duplicate')) {
        throw roleError;
      }

      return claim;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-claims'] });
      queryClient.invalidateQueries({ queryKey: ['all-claims'] });
      queryClient.invalidateQueries({ queryKey: ['candidate'] });
      toast.success('Claim approved! The politician can now edit their profile.');
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve claim: ${error.message}`);
    },
  });
}

// Admin: reject a claim
export function useRejectClaim() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      claimId,
      rejectionReason,
    }: {
      claimId: string;
      rejectionReason: string;
    }) => {
      if (!user?.id) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('profile_claims')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq('id', claimId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-claims'] });
      queryClient.invalidateQueries({ queryKey: ['all-claims'] });
      toast.success('Claim rejected.');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject claim: ${error.message}`);
    },
  });
}
