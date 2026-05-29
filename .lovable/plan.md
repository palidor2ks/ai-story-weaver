## Problem

On `/admin/social-posts`, the **View card** link opens `post.share_url`, which points at the `share-card-page` edge function. That endpoint serves an HTML page designed for social-media unfurling (OG meta tags + redirect to the candidate profile), not the rendered PNG. So clicking "View card" either redirects to the candidate page or shows a blank/unhelpful page — i.e., it "doesn't work" as a way to preview the image.

The actual PNG is uploaded to the public `share-cards` storage bucket at path `{id}.png`, but its URL is never stored on the `social_posts` row.

## Fix

Link "View card" to the real image URL.

1. **`supabase/functions/upload-share-card/index.ts`** — also return `imageUrl` (the public storage URL for the uploaded PNG) alongside `shareUrl`.

2. **`src/lib/shareUpload.ts`** — extend the return type with `imageUrl` and pass it through.

3. **`src/pages/admin/SocialPosts.tsx`** —
   - In `renderAndUpload`, persist `image_url` (the PNG URL) on the `social_posts` row in addition to `share_url`.
   - Change the "View card" anchor to prefer `post.image_url`, falling back to `post.share_url` for older rows that don't have it.

No DB schema changes needed — `social_posts.image_url` already exists.

## Verification

- Open `/admin/social-posts` → Queue tab.
- Click **Re-render** on an existing post → toast succeeds, row refetches.
- Click **View card** → opens the PNG directly in a new tab.
- Older rows without `image_url` still open (falling back to the share page).
