// Lightweight analytics shim. Forwards to GA/GTM dataLayer and PostHog when
// present, and always logs in dev. Swap for a real SDK later without touching
// call sites.

export type ShareEventName =
  | 'share_modal_opened'
  | 'share_template_selected'
  | 'share_caption_edited'
  | 'share_hashtags_toggled'
  | 'share_action';

export type ShareActionKind =
  | 'copy_caption'
  | 'copy_link'
  | 'copy_image'
  | 'download'
  | 'native'
  | 'open_intent';

export type ShareDestination =
  | 'twitter'
  | 'facebook'
  | 'linkedin'
  | 'native'
  | 'clipboard'
  | 'file';

type AnyProps = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: AnyProps[];
    posthog?: { capture: (name: string, props?: AnyProps) => void };
  }
}

export function trackEvent(name: ShareEventName | string, props: AnyProps = {}) {
  try {
    if (typeof window === 'undefined') return;
    const payload = { event: name, ...props };
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
    window.posthog?.capture(name, props);
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', name, props);
    }
  } catch {
    // never let analytics break the UI
  }
}
