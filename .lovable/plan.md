## Goal
Add a `/blog` page that embeds the Soro blog widget.

## Changes

### 1. New page: `src/pages/Blog.tsx`
- Wraps content in existing `Header` for consistent nav.
- Renders the Soro mount point: `<div id="soro-blog" />`.
- Injects the Soro embed script once on mount via `useEffect`:
  - Create `<script src="https://app.trysoro.com/api/embed/b93e22d4-ef42-44c1-9514-450a619ebb6d" defer>`, append to `document.body`.
  - Cleanup on unmount: remove the script tag and clear the mount node so re-navigation re-initializes cleanly.
- SEO: set `document.title = "Blog | Pulse"` and a meta description ("Latest updates and articles from Pulse."). Single `<h1>` (visually hidden or shown above embed).
- Container: `container mx-auto py-8` with semantic tokens only.

### 2. Route registration in `src/App.tsx`
- Import `Blog` and add:
  ```
  <Route path="/blog" element={
    <RouteGuard requireAuth requireOnboarding>
      <Blog />
    </RouteGuard>
  } />
  ```
- Matches the protected pattern used by other content pages.

### 3. Header nav entry in `src/components/Header.tsx`
- Add `{ path: '/blog', label: 'Blog', icon: Newspaper }` (lucide `Newspaper`) to `navItems` so it shows in desktop + mobile nav.

## Open question
Should `/blog` be public (no auth required) so search engines and unauthenticated visitors can read posts? Default in plan: protected (matches rest of app). Tell me if you want it public and I'll drop the `RouteGuard`.

## Out of scope
- No styling overrides of the Soro widget internals (it's a third-party iframe/embed).
- No backend changes.

## Verification
- Visit `/blog` while signed in: header shows, Soro widget loads into `#soro-blog`.
- Navigate away and back: widget re-mounts without duplicate scripts.
- Check console/network for the embed script returning 200.
