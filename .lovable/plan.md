# Populate `x_handle` for representatives

Today `candidates.x_handle` is a plain text column with no UI. You can only set it via SQL in the Supabase dashboard. This plan adds a proper admin workflow.

## Option A — Quick: SQL only (no build needed)

Run in Supabase SQL editor:

```sql
UPDATE public.candidates SET x_handle = 'RepThomasMassie' WHERE id = '...';
UPDATE public.candidates SET x_handle = 'RepGallrein'    WHERE id = '...';
```

Then trigger the existing `sync-representative-x-posts` edge function (single or batch mode) to pull tweets.

Good for a one-off seed; bad for ongoing maintenance.

## Option B — Admin UI (recommended)

### 1. Admin page: `/admin/social-handles`

A table of candidates (filterable by office/state) with:

- Name, office, state, district
- Editable `x_handle` input (inline save, validates `^[A-Za-z0-9_]{1,15}$`, strips leading `@`)
- Last synced timestamp (max `posted_at` from `representative_social_posts`)
- Post count
- "Sync now" button per row → invokes `sync-representative-x-posts` with that `candidate_id`
- "Sync all with handles" button at top → batch mode

Admin-only (existing `has_role(auth.uid(), 'admin')` guard, same pattern as other admin pages).

### 2. Inline edit on `CandidateProfile` (admin only)

Small pencil icon next to the social feed header, visible only to admins, opens a popover to set/clear `x_handle` and immediately trigger a sync.

### 3. Optional: scheduled sync

`pg_cron` job calling `sync-representative-x-posts` in batch mode every 6h so feeds stay fresh without manual clicks.

## Files to add/change (Option B)

- `src/pages/admin/SocialHandles.tsx` — new admin page
- `src/components/admin/CandidateHandleRow.tsx` — row with edit + sync
- `src/hooks/useUpdateCandidateHandle.ts` — mutation hook
- `src/hooks/useSyncRepresentativePosts.ts` — invokes edge function
- `src/App.tsx` — add `/admin/social-handles` route
- `src/components/admin/AdminNav.tsx` (or equivalent) — add link
- `src/pages/CandidateProfile.tsx` — admin pencil affordance

No DB migration needed (`x_handle` column and edge function already exist).

## Recommendation

Do Option B. Tell me which to build (or both) and I'll implement.
