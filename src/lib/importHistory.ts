import { supabase } from '@/integrations/supabase/client';

// Data access for the donor / IE import-history panels. Returns raw PostgREST
// results so callers keep their existing { data, error } handling. The IE table
// and RPC aren't in the generated types yet, hence the `as any` casts (kept here).

export function fetchDonorImportSessions() {
  return supabase
    .from('donor_import_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(15);
}

export function undoDonorImport(sessionId: string) {
  return supabase.rpc('undo_donor_import', { p_session_id: sessionId });
}

export function fetchIeImportSessions() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase
    .from('ie_import_sessions' as any)
    .select('*')
    .order('started_at', { ascending: false })
    .limit(15);
}

export function undoIeImport(sessionId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.rpc('undo_ie_import' as any, { p_session_id: sessionId });
}
