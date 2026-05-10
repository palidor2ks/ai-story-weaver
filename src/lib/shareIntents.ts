export const twitterIntent = (text: string, url: string) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

export const facebookIntent = (url: string, text?: string) => {
  const base = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  return text ? `${base}&quote=${encodeURIComponent(text)}` : base;
};

export const linkedinIntent = (url: string) =>
  `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

export function openIntent(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
}

export const supportsNativeShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export async function nativeShare(opts: { title: string; text: string; url: string; files?: File[] }) {
  if (!supportsNativeShare()) return false;
  try {
    if (opts.files && opts.files.length > 0 && (navigator as any).canShare?.({ files: opts.files })) {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url, files: opts.files });
    } else {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
    }
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return true;
    return false;
  }
}
