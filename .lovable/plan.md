# Restore access to onboarding after a quiz reset

## Problem

When the user clicks "Reset Onboarding" on the profile page, `useResetOnboarding` wipes `quiz_answers` / `user_topics` / topic scores, then `handleResetOnboarding` calls `navigate('/')`.

But:

- `/` is hard-coded to `<Navigate to="/candidates" replace />` (`src/App.tsx:109`). The `Index` page that renders `<Onboarding />` is never mounted anywhere.
- `/profile`, `/quiz`, `/quiz-library`, `/results` all use `RouteGuard requireOnboarding`. With `has_completed_onboarding = false`, the guard bounces back to `/` → `/candidates`.
- There is no `/onboarding` route and no link in the `Header` to start onboarding.

Result: the profile page disappears and there is no surfaced path back into the quiz. The same dead-end also hits brand-new users right after signup.

## Fix

1. **Add a dedicated onboarding route** in `src/App.tsx`:
   - `import { Onboarding } from "./pages/Onboarding";`
   - `<Route path="/onboarding" element={<RouteGuard requireAuth requireOnboarding={false}><Onboarding /></RouteGuard>} />`

2. **Send users without answers to onboarding from `/`.** Replace the static `<Navigate to="/candidates" />` for `/` with a small component that uses `useAuth` + `useHasCompletedOnboarding`:
   - not logged in → `/auth`
   - logged in, not onboarded → `/onboarding`
   - logged in, onboarded → `/candidates`
   This also fixes new signups (`Auth.tsx` already navigates to `/`).

3. **Update reset flow** in `src/pages/UserProfile.tsx` (`handleResetOnboarding`): `navigate('/onboarding')` instead of `navigate('/')`, so the user lands directly in the quiz after a reset.

4. **Guard the `Onboarding` page itself**: if `useHasCompletedOnboarding` returns true, `Navigate` to `/profile` so users can't accidentally re-enter and double-save. (Small addition at top of `Onboarding.tsx`.)

5. **Delete the now-unused `src/pages/Index.tsx`** (it was only reachable via the old `/` route via an older config, but is currently dead code since `/` redirects elsewhere). Optional cleanup — keep if you'd rather not touch it.

## Files touched

- `src/App.tsx` — add `/onboarding` route, replace `/` redirect with conditional component.
- `src/pages/UserProfile.tsx` — `navigate('/onboarding')` after reset.
- `src/pages/Onboarding.tsx` — early redirect to `/profile` if already onboarded.
- (optional) remove `src/pages/Index.tsx`.

No DB, RLS, or business-logic changes.
