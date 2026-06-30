import { supabase } from '@/integrations/supabase/client';

/**
 * Uploads an avatar image to the `avatars` storage bucket, persists the
 * cache-busted public URL on the user's profile, and returns that URL.
 * Throws on any storage or update error.
 */
export async function uploadUserAvatar(userId: string, file: File): Promise<string> {
  // Create a unique filename
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/avatar.${fileExt}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true });
  if (uploadError) throw uploadError;

  // Get the public URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName);

  // Add cache-busting query param
  const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

  // Update profile with new avatar URL
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: urlWithCacheBust })
    .eq('id', userId);
  if (updateError) throw updateError;

  return urlWithCacheBust;
}
