import { supabase } from '@/integrations/supabase/client';

// Data access for the pending-badge toast poller. Tables aren't in the generated
// types yet, hence the `as never` casts (kept here, out of the component). Returns
// raw PostgREST results so the caller keeps its existing { data, error } handling.

export function fetchPendingBadgeNotifications(userId: string) {
  return supabase
    .from('pending_badge_notifications' as never)
    .select('id,badge_slug')
    .eq('user_id', userId);
}

export function fetchBadgeDefinitions(slugs: string[]) {
  return supabase
    .from('badge_definitions' as never)
    .select('slug,name,icon,description')
    .in('slug', slugs);
}

export function deletePendingBadgeNotifications(ids: string[]) {
  return supabase.from('pending_badge_notifications' as never).delete().in('id', ids);
}
