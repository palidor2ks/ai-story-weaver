## Fix: Header navigation visibility by role

**Problem:** `src/components/Header.tsx` mixes auth-gating inconsistently. Non-users see Candidates/Donors/Blog (good) but logged-in non-admin users are missing browse pages like Parties/Committees when they shouldn't be, and the admin/politician icons are gated correctly but the rule isn't unified.

**Target behavior:**
- **Non-logged-in:** Candidates, Donors, Blog only.
- **Logged-in (non-admin):** Everything except the Admin shield icon (Feed, Candidates, Parties, Donors, Committees, Quizzes, Blog, Profile, How Scoring Works, plus Politician icon if applicable).
- **Admin:** All of the above plus the Admin shield icon.

### Changes

**`src/components/Header.tsx`** (only file edited):

1. Wait for auth + role data before rendering role-gated items to prevent flash:
   - Pull `loading` from `useAuth()`.
   - Pull `isLoading` from `useAdminRole()` and `usePoliticianRole()`.
   - While `loading` is true, render the header shell (logo + mobile button) but skip the nav items list. Admin/politician icons render only once their respective queries settle.

2. Confirm the `navItems` array `requiresAuth` flags match the spec:
   - `requiresAuth: false` → Candidates, Donors, Blog
   - `requiresAuth: true` → Feed, Parties, Committees, Quizzes, Profile
   - (Current array already matches — no change needed there.)

3. Keep `isAdmin` / `isPolitician` icons rendered only when their data has loaded AND the flag is true, so non-admin logged-in users never see them and there's no flash for admins.

4. Apply the same gating to the mobile menu (same `visibleNavItems` array is already shared — verify and keep).

### Verification

- Log out → nav shows: Candidates, Donors, Blog, How Scoring Works icon.
- Log in as regular user → adds Feed, Parties, Committees, Quizzes, Profile. No Admin icon.
- Log in as admin → all of the above plus the Admin shield. No flash of the icon during load.
- Mobile menu mirrors desktop in all three cases.

No other files need changes. No backend/data changes.