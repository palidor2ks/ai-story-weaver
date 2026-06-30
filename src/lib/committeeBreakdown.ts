import { supabase } from '@/integrations/supabase/client';

// Data access for the admin committee-breakdown panel (imperative, not react-query).
// Returns raw PostgREST results so callers keep their { data, error } handling.

export function fetchCandidateCommittees(candidateId: string) {
  return supabase
    .from('candidate_committees')
    .select('id, fec_committee_id, name, designation, designation_full, role, active, local_itemized_total, fec_itemized_total, last_sync_completed_at, last_sync_started_at, last_index, has_more, cycles, is_terminated, last_contribution_date')
    .eq('candidate_id', candidateId)
    .order('role', { ascending: true });
}

export function setCommitteeActive(id: string, active: boolean) {
  return supabase
    .from('candidate_committees')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id);
}
