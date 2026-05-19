## Plan

Fix `src/components/Header.tsx` so the navigation matches the approved visibility rules:

1. **Use the real authenticated user source**
   - Replace `useUser()` in the header with `useAuth()` for `user` and `loading`.
   - Root cause: `useUser()` is a local quiz/onboarding context and is not the Supabase auth user, so logged-in users can still look like non-users in the nav.

2. **Correct public vs signed-in nav items**
   - Logged-out visitors see only public browse pages: `Candidates`, `Donors`, `Blog`.
   - Signed-in non-admin users see: `Feed`, `Candidates`, `Parties`, `Donors`, `Committees`, `Quizzes`, `Blog`, `Profile`, plus `How Scoring Works` if it remains a signed-in page.
   - Admin users see all of the above plus `Admin`.

3. **Remove/limit the extra icon issue shown in the screenshot**
   - The unlabeled `How Scoring Works` help icon currently appears for non-users even though its route requires auth.
   - Gate it behind authenticated user state, or convert it into a normal signed-in nav item if space allows.

4. **Keep role buttons safely gated**
   - Admin and politician dashboard buttons render only after auth and role queries finish.
   - Regular users never see the Admin shield.

5. **Mirror desktop and mobile behavior**
   - Use the same filtered nav list for desktop and mobile so both menus behave identically.

## Technical details

- Change `Header.tsx` to rely on `const { user, loading: authLoading } = useAuth()` only.
- Remove the `useUser()` import and local user context dependency from the header.
- Update `visibleNavItems` and the `How Scoring Works` button condition to require `!authLoading && user` when appropriate.
- Keep public links visible during auth loading; hide auth-only links until auth resolves.