## Changes to `src/pages/Auth.tsx`

1. Replace the Sparkles gradient square logo with the app icon (`/icon-192.png` — the American-flag Pulse mark used as the PWA/app icon). Render as an `<img>` at the same 64×64 size, with rounded corners and the existing glow shadow.
2. Remove the "Continue with X" button, its `handleXSignIn` handler, and the "Or with email" divider (no longer needed since email is the only option).
3. Remove the now-unused `Sparkles` import.
