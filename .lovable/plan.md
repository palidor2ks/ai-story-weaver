## Add OG share image with Pulse logo + tagline

### Steps

1. **Generate `public/og-image.png`** — 1200×630 social share card featuring the Pulse logo prominently with the tagline *"Know Your Vote — Discover where you stand on the issues"* on a brand-color background. Built by editing the existing `src/assets/logo.png` via the image tool so the logo stays on-brand.

2. **Update `index.html` meta tags**:
   - Change `og:image` and `twitter:image` to the absolute URL `https://polipulse.lovable.app/og-image.png`.
   - Add `og:url`, `og:image:width` (1200), `og:image:height` (630), `og:image:alt`.
   - Keep `twitter:card` as `summary_large_image`.

### Result

Links shared from "Share my results" or "Invite others to take it" will render a large preview card with the Pulse logo and tagline on X, Facebook, LinkedIn, iMessage, Slack, etc.

### Notes

- Facebook/LinkedIn cache OG data; first preview after deploy may need a refresh via [FB Debugger](https://developers.facebook.com/tools/debug/) or [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/).
- Same image is used for both share modes (per-user dynamic OG images would require an edge function — not in scope).