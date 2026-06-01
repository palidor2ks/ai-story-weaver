import { supabase } from '@/integrations/supabase/client';

export type BadgeEventType =
  | 'onboarding_completed'
  | 'priority_picker'
  | 'federal_quiz_completed'
  | 'local_quiz_completed'
  | 'identity_verified'
  | 'voter_verified'
  | 'address_added'
  | 'avatar_uploaded'
  | 'demographics_updated'
  | 'question_answered'
  | 'quiz_retaken'
  | 'match_viewed'
  | 'poll_completed'
  | 'election_viewed'
  | 'donor_viewed'
  | 'scoring_viewed'
  | 'news_opened'
  | 'share_completed'
  | 'referral_sent'
  | 'referral_signup'
  | 'profile_claimed'
  | 'platform_first_answer'
  | 'platform_complete'
  | 'evidence_added'
  | 'finance_synced';

/**
 * Fire-and-forget event logger. Never throws — badge awarding must never
 * block the user action that triggered it.
 */
export async function logBadgeEvent(
  eventType: BadgeEventType,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // anonymous; nothing to award
    const { error } = await supabase.rpc('log_user_event' as never, {
      p_event_type: eventType,
      p_payload: payload,
    } as never);
    if (error) console.warn('[badges] log_user_event failed:', error.message);
  } catch (e) {
    console.warn('[badges] log_user_event exception:', e);
  }
}
