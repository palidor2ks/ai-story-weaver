import { supabase } from '@/integrations/supabase/client';

export interface UploadShareCardArgs {
  blob: Blob;
  targetUrl: string;
  ogTitle: string;
  ogDescription: string;
}

export async function uploadShareCard({
  blob,
  targetUrl,
  ogTitle,
  ogDescription,
}: UploadShareCardArgs): Promise<{ shareUrl: string; id: string }> {
  const form = new FormData();
  form.append('file', new File([blob], 'card.png', { type: 'image/png' }));
  form.append('targetUrl', targetUrl);
  form.append('ogTitle', ogTitle);
  form.append('ogDescription', ogDescription);

  const { data, error } = await supabase.functions.invoke('upload-share-card', {
    body: form,
  });
  if (error) throw error;
  if (!data?.shareUrl) throw new Error('no shareUrl');
  return data as { shareUrl: string; id: string };
}
