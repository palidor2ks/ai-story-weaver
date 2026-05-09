# Plan: Installable App + Legal Pages

Two independent workstreams. Both are frontend-only.

---

## 1. Make Pulse installable (manifest-only, no service worker)

Per Lovable guidance, we'll skip `vite-plugin-pwa` and service workers (they break the editor preview and can serve stale builds). A plain web app manifest is enough for "Add to Home Screen" on iOS and the Android install prompt — which is what you actually want.

### What we'll add

- **`public/manifest.webmanifest`** — name "Pulse", short_name "Pulse", `start_url: "/feed"`, `display: "standalone"`, theme/background colors pulled from your design tokens, and icon entries.
- **Icons in `public/`** — generate a 512×512 maskable PNG and a 192×192 PNG from the existing logo. Reuse `og-image.png` style branding.
- **Apple touch icon** — 180×180 PNG (iOS ignores the manifest icon list for the home screen; it needs `apple-touch-icon`).
- **`index.html` `<head>` additions**:
  - `<link rel="manifest" href="/manifest.webmanifest">`
  - `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<meta name="apple-mobile-web-app-title" content="Pulse">`
  - `<meta name="theme-color" content="<your primary in hex>">`

### How users install
- **iOS Safari**: Share → Add to Home Screen
- **Android Chrome**: browser menu → Install app (or auto prompt)
- **Desktop Chrome/Edge**: install icon in URL bar

No offline support, no push notifications — those need a real service worker, which we're intentionally avoiding for now.

---

## 2. Add Terms of Service and Privacy Policy pages

### Pages
- `src/pages/Terms.tsx` → route `/terms`
- `src/pages/Privacy.tsx` → route `/privacy`

Both rendered as public routes (no auth required) so they're crawlable and linkable from app stores / social previews. Use existing `Header`-less simple layout with a back link, semantic HTML (`<h1>`, `<h2>`, `<section>`), and design-system tokens.

### Content (starter templates — you'll want a lawyer to review before going truly "official")

**Terms of Service** sections:
- Acceptance of terms
- Description of service ("Pulse helps users discover where they stand on political issues and compare to candidates / parties / representatives. Information is aggregated from public sources and AI analysis and may contain errors.")
- Eligibility (13+ / 18+)
- User accounts & responsibilities
- Acceptable use (no scraping, no harassment, no manipulation of quiz data)
- Intellectual property
- Disclaimers (especially: scores and AI explanations are informational, not endorsements; users should verify with primary sources)
- Limitation of liability
- Termination
- Changes to terms
- Contact

**Privacy Policy** sections:
- What we collect (account info, address for representative matching, quiz answers, usage analytics)
- How we use it (matching candidates, generating personalized comparisons, improving the service)
- Third-party services we use (Supabase/Lovable Cloud for storage & auth, Google Places for address autocomplete, Perplexity & Lovable AI Gateway for research, Congress.gov & FEC for public data, OpenStates for civic info)
- Data sharing (we don't sell your data)
- Cookies & local storage
- User rights (access, correction, deletion — request via email)
- Data retention
- Children's privacy
- Security
- Changes
- Contact

### Wiring
- Register both routes in `src/App.tsx` **outside** `RouteGuard` so they're public.
- Add footer links in `Header.tsx` mobile menu and a small footer component on key pages (or just the auth page) linking to `/terms` and `/privacy`.
- Auth page: add "By signing up you agree to our Terms and Privacy Policy" line above the submit button.

---

## Open questions before I implement

1. **Contact email** for the legal pages (e.g. `support@polipulseapp.com`)?
2. **Effective date** — use today (May 9, 2026) for both?
3. **Minimum age** — 13+ (COPPA floor) or 18+ (since it's political)?
4. **Footer scope** — add a global footer to every page, or only on Auth + legal pages?
