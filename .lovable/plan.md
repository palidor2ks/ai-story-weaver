## Goal
Let admins open another user's profile in a read-only view that mirrors the real `/profile` page (not just a summary dialog).

## Approach
Add a new admin-only route `/admin/users/:userId` that renders a read-only version of `UserProfile`. It reuses the existing layout and child components but sources data by `userId` (the target user) instead of the logged-in `auth.uid()`. No impersonation, no editing.

## Steps

### 1. Database (RLS)
Audit and, where missing, add admin SELECT policies on the tables `UserProfile` reads:
- `profiles` — already has "Admins can view all profiles" ✅
- `user_topics`, `user_topic_scores`, `quiz_answers` — add `FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'))` if not present
- No write policies added.

### 2. Hook refactor (small, additive)
Add an optional `userId?: string` arg to:
- `useProfile(userId?)`
- `useUserTopics(userId?)`
- `useUserTopicScores(userId?)`
- `usePartyMatchScores(userId?)`

When omitted, behavior is unchanged (uses `auth.uid()` from `useAuth`). When provided, the hook queries that id and skips the `auth.uid` filter. Query keys include the resolved id so caches don't collide.

`useRepresentatives` / `useCivicOfficials` already take `address` as a param — no change needed; we pass the target user's `profile.address`.

### 3. New page `src/pages/AdminUserProfileView.tsx`
- Reads `:userId` from the URL.
- Guards with `useUserRole()` — redirects non-admins.
- Renders the same visual sections as `UserProfile`:
  - Header card (name, avatar, badges, address, joined)
  - Topic scores + top topics
  - Party comparison
  - Representatives + civic officials list with scores
  - Upcoming elections
  - AI analysis (read-only, no "regenerate" buttons)
- Removes/hides all mutation UI: Edit profile, Change password, Avatar upload, Address edit, Reset onboarding, Sign out, refresh buttons. Adds a top "Viewing as admin — read only" banner with a Back link to `/admin`.

### 4. Wire up navigation
- In `AdminUsersPanel.tsx`, change row click from opening the dialog to `navigate('/admin/users/' + p.id)`.
- Keep or remove `AdminUserDetailDialog` (recommend remove — replaced by full page).

### 5. Route
Add `<Route path="/admin/users/:userId" element={<AdminUserProfileView />} />` in `src/App.tsx`.

## Technical notes
- No changes to `UserProfile.tsx` itself — admin view is a separate component to keep edit logic isolated and avoid accidental writes.
- All admin reads rely on `has_role(auth.uid(),'admin')` RLS policies — no service role, no impersonation tokens.
- Query cache keys become `['profile', targetUserId]` etc., so admin views don't pollute the logged-in user's cache.