import { supabase } from '@/integrations/supabase/client';

// Data operations for the browser-driven FEC donor CSV import. The panel runs an
// imperative batch loop (not react-query), so these are plain async helpers; they
// exist to keep the Supabase client out of the component (one-front-door rule).

export interface CommitteeCandidateMapping {
  fec_committee_id: string;
  candidate_id: string | null;
  candidates: { name: string | null } | null;
}

// Mark a session terminated so it doesn't masquerade as 'running' forever.
// Best-effort: the import is browser-driven, so a deliberate stop must write the
// terminal status itself (nothing on the backend does).
export async function markImportSessionCancelled(sessionId: string) {
  await supabase
    .from('donor_import_sessions')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'running');
}

export async function markImportSessionCompleted(sessionId: string, hasErrors: boolean) {
  await supabase
    .from('donor_import_sessions')
    .update({
      status: hasErrors ? 'completed_with_errors' : 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

// Resolve candidate links for a set of committee IDs (for the multi-committee preview).
export async function fetchCommitteeCandidateMappings(
  distinctIds: string[],
): Promise<CommitteeCandidateMapping[]> {
  const { data } = await supabase
    .from('candidate_committees')
    .select('fec_committee_id, candidate_id, candidates:candidate_id(name)')
    .in('fec_committee_id', distinctIds);
  return (data ?? []) as unknown as CommitteeCandidateMapping[];
}

export async function countContributionsForCommittee(committeeId: string): Promise<number> {
  const { count } = await supabase
    .from('contributions')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_committee_id', committeeId);
  return count || 0;
}

export async function fetchCandidateIdForCommittee(committeeId: string): Promise<string | null> {
  const { data: committee } = await supabase
    .from('candidate_committees')
    .select('candidate_id')
    .eq('fec_committee_id', committeeId)
    .single();
  return committee?.candidate_id ?? null;
}

// Invoke the import edge function. Returns the raw { data, error } response because
// the caller inspects error.context to handle the cycle-mismatch confirmation flow.
export function invokeImportFecReceiptsCsv(body: Record<string, unknown>) {
  return supabase.functions.invoke('import-fec-receipts-csv', { body });
}
