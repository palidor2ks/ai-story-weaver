import { supabase } from '@/integrations/supabase/client';

// Data access for the admin social-account connect pages (TikTok / X). Returns
// the raw PostgREST result so callers keep their existing { data, error } handling.

export function fetchTikTokAccounts() {
  return supabase
    .from('tiktok_account_tokens')
    .select('id, open_id, display_name, avatar_url, expires_at, updated_at')
    .order('updated_at', { ascending: false });
}

export function deleteTikTokAccount(id: string) {
  return supabase.from('tiktok_account_tokens').delete().eq('id', id);
}

export function fetchXAccounts() {
  return supabase
    .from('x_account_tokens')
    .select('id, account_handle, expires_at, updated_at')
    .order('updated_at', { ascending: false });
}

export function deleteXAccount(id: string) {
  return supabase.from('x_account_tokens').delete().eq('id', id);
}
