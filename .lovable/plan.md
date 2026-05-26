## Admin Tweet Composer

Add a small admin-only page to compose and post a tweet via the existing `x-post-tweet` edge function.

### Scope
- New route `/admin/x-composer` (admin-gated using `useAdminRole`).
- Add a link/card entry from the existing Admin page so it's discoverable.
- No backend changes — the `x-post-tweet` function already exists and handles auth, admin check, token refresh, and posting.

### UI
- Card with:
  - Optional `account_handle` input (leave blank to use the only connected account).
  - Textarea for tweet text with a live character counter (limit 280, matches Zod schema).
  - "Post tweet" button (disabled when empty, >280, or while submitting).
  - On success: toast with tweet URL (returned from the function) and a "View on X" link; clear the textarea.
  - On error: toast with error message from the function (`no_x_account_connected`, `post_failed`, etc.).

### Technical details
- File: `src/pages/admin/XComposer.tsx`.
- Register route in `src/App.tsx`, guarded by `useAdminRole` (redirect non-admins to `/`).
- Call edge function with `supabase.functions.invoke('x-post-tweet', { body: { text, account_handle } })` — this automatically forwards the user's JWT in the Authorization header.
- Use existing UI primitives: `Card`, `Textarea`, `Input`, `Button`, `Label`, `toast` from sonner.
- Zod schema mirroring the edge function's body schema for client-side validation.

### Out of scope
- Connecting an X account (OAuth flow to populate `x_account_tokens`). Posting requires a row in that table — if none exists the function returns `no_x_account_connected` and the UI will surface that error. Connect flow can be a follow-up.
