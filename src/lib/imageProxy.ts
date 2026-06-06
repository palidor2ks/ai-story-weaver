// Wraps cross-origin image URLs through our proxy-image edge function so
// html-to-image / canvas can read the pixels without CORS errors.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export function proxiedImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // Same-origin URLs are fine as-is.
  if (typeof window !== 'undefined') {
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin === window.location.origin) return url;
    } catch {
      return url;
    }
  }

  if (!SUPABASE_URL) return url;

  // Our own Supabase Storage objects are already served with permissive CORS,
  // so html-to-image can read them directly. Proxying them is pointless and
  // would re-impose the proxy's size cap on photos we host ourselves (e.g.
  // full-res official portraits), so pass them through untouched.
  if (url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`)) return url;

  return `${SUPABASE_URL}/functions/v1/proxy-image?url=${encodeURIComponent(url)}`;
}
