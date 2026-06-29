import { supabase } from '@/integrations/supabase/client';

/**
 * Thin wrappers over supabase.auth so components/pages don't import the client
 * directly (the one-front-door rule — see docs/ARCHITECTURE-AUDIT.md). Each
 * returns the raw supabase response so callers keep their existing handling.
 */

export function updateUserPassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export function resendSignupVerification(email: string) {
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
}

export function refreshSession() {
  return supabase.auth.refreshSession();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
}
