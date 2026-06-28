import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PLATFORMS = ['x', 'facebook', 'instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface SocialPost {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_label: string | null;
  stat_key: string | null;
  stat_payload: any;
  image_url: string | null;
  share_url: string | null;
  status: string;
  posted_at: string | null;
  created_at: string;
  rejected_reason: string | null;
}

export interface PlatformRow {
  id: string;
  post_id: string;
  platform: Platform;
  caption: string | null;
  enabled: boolean;
  status: string;
  external_url: string | null;
  error_message: string | null;
  posted_at: string | null;
}

export interface Settings {
  id: number;
  mode: 'manual' | 'auto';
  post_time_local: string;
  timezone: string;
  auto_approve_after_hours: number;
  x_enabled: boolean;
  facebook_enabled: boolean;
  instagram_enabled: boolean;
  tiktok_enabled: boolean;
  recent_skip_days: number;
}

export interface RaceOption {
  state: string;
  office: string;
  year: number;
  candidate_count: number;
}

export interface RaceCandidate {
  id: string;
  name: string;
  party: string;
  incumbent: boolean;
  raised: number;
  has_image: boolean;
}

// ---------- Queries ----------
export function useSettings() {
  return useQuery({
    queryKey: ['social-post-settings'],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from('social_post_settings').select('*').eq('id', 1).single();
      if (error) throw error;
      return data as Settings;
    },
  });
}

export function useSocialPosts(status: 'pending_review' | 'posted_or_failed') {
  return useQuery({
    queryKey: ['social-posts', status],
    queryFn: async () => {
      let q = supabase.from('social_posts').select('*').order('created_at', { ascending: false });
      if (status === 'pending_review') q = q.eq('status', 'pending_review');
      else q = q.in('status', ['posted', 'failed', 'rejected']);
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return (data ?? []) as SocialPost[];
    },
    refetchInterval: 30_000,
  });
}

export function usePlatformRows(postIds: string[]) {
  return useQuery({
    queryKey: ['social-post-platforms', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('social_post_platforms').select('*').in('post_id', postIds);
      if (error) throw error;
      return (data ?? []) as PlatformRow[];
    },
  });
}

export function useRaceOptions() {
  return useQuery({
    queryKey: ['race-options'],
    queryFn: async (): Promise<RaceOption[]> => {
      const { data, error } = await supabase.rpc('get_race_options');
      if (error) throw error;
      return (data ?? []) as RaceOption[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useRaceCandidates(state: string, office: string, year: string, enabled: boolean) {
  return useQuery({
    queryKey: ['race-candidates', state, office, year],
    enabled: enabled && !!state && !!office && !!year,
    queryFn: async (): Promise<RaceCandidate[]> => {
      const { data, error } = await supabase.rpc('get_race_candidates', { _state: state, _office: office, _year: Number(year) });
      if (error) throw error;
      return (data ?? []) as RaceCandidate[];
    },
    staleTime: 5 * 60_000,
  });
}

// ---------- Mutations / data operations ----------
// Edge-function invokes return the raw { data, error } response because callers
// branch on data.error / data.results / data.created etc.
export function draftRaceComparison(body: Record<string, unknown>) {
  return supabase.functions.invoke('draft-race-comparison', { body });
}

// Use functions.invoke so the admin's session token is attached — the function
// authorizes cron/service callers OR an authenticated admin.
export function pickDailyStatCard(subjectType: string) {
  return supabase.functions.invoke('pick-daily-stat-card', {
    body: { force: true, subject_type: subjectType },
  });
}

export function generateSocialCaption(body: Record<string, unknown>) {
  return supabase.functions.invoke('generate-social-caption', { body });
}

export function renderSocialCard(postId: string) {
  return supabase.functions.invoke('render-social-card', { body: { post_id: postId } });
}

export function postSocialCard(postId: string) {
  return supabase.functions.invoke('post-social-card', { body: { post_id: postId } });
}

export async function updateSocialPostSettings(s: Settings) {
  const { error } = await supabase.from('social_post_settings').update({
    mode: s.mode,
    post_time_local: s.post_time_local,
    timezone: s.timezone,
    auto_approve_after_hours: s.auto_approve_after_hours,
    x_enabled: s.x_enabled,
    facebook_enabled: s.facebook_enabled,
    instagram_enabled: s.instagram_enabled,
    tiktok_enabled: s.tiktok_enabled,
    recent_skip_days: s.recent_skip_days,
  }).eq('id', 1);
  if (error) throw error;
}

// Best-effort optimistic patch (callers update local state first); mirrors the
// original inline call which did not surface errors.
export async function updateSocialPostPlatform(id: string, patch: Partial<PlatformRow>) {
  await supabase.from('social_post_platforms').update(patch).eq('id', id);
}

export async function updateSocialPostShare(
  postId: string,
  fields: { share_url: string; share_card_id: string; image_url: string | null },
) {
  const { error } = await supabase.from('social_posts').update(fields).eq('id', postId);
  if (error) throw error;
}

export async function rejectSocialPost(postId: string) {
  await supabase.from('social_posts').update({ status: 'rejected' }).eq('id', postId);
}
