
# Auto-Post Polls to Social Media

## Overview
When a poll is published, it can post itself to selected social platforms from a single brand account. Admin picks platforms in the editor; auto-posts on publish; can re-share manually anytime.

## Scope (this iteration)
- **X (Twitter)** — fully wired (post tweet with poll link + OG card image)
- **Facebook Page**, **LinkedIn**, **Instagram** — selectable in UI, edge function scaffolded with TODO; posting disabled until OAuth/page creds added
- Single brand account: credentials stored as Supabase secrets, not per-user

## UX Changes
1. **Poll Editor** (`PollsPanel.tsx`)
   - New "Share to" multi-select chips: X, Facebook Page, LinkedIn, Instagram (latter three show "Connect required" until secrets exist)
   - Toggle "Auto-post on publish" (default ON)
   - Custom caption field (optional, defaults to `{title} — Take the poll: {url}`)
2. **Poll Row Actions**
   - "Post to X / FB / LinkedIn / IG" buttons (manual re-share)
   - Last-posted indicator + link to the social post URL when returned
3. **Image**
   - Generated once on publish via existing share-card pattern; stored in new `poll-og` bucket; referenced in OG meta + attached to tweet

## Database

```sql
-- Add to polls
ALTER TABLE polls ADD COLUMN share_platforms text[] DEFAULT '{}';
ALTER TABLE polls ADD COLUMN auto_post boolean DEFAULT true;
ALTER TABLE polls ADD COLUMN share_caption text;
ALTER TABLE polls ADD COLUMN og_image_url text; -- if not already

-- New table: track each post attempt
CREATE TABLE poll_social_posts (
  id uuid PK,
  poll_id uuid FK,
  platform text,           -- 'twitter' | 'facebook' | 'linkedin' | 'instagram'
  status text,             -- 'pending' | 'success' | 'failed'
  remote_post_id text,
  remote_post_url text,
  error text,
  posted_at timestamptz,
  created_at timestamptz default now()
);
-- RLS: admins manage; published rows readable
```

## Edge Functions

### `generate-poll-og-image` (new)
- Calls Lovable AI Gateway image model with poll title + branding prompt
- Uploads PNG to `poll-og` storage bucket
- Returns public URL; updates `polls.og_image_url`

### `post-poll-to-social` (new)
- Input: `{ pollId, platforms: string[] }`
- Auth: admin only (`has_role`)
- For each platform:
  - **twitter**: OAuth 1.0a signed POST to `https://api.x.com/2/tweets` with text + media (uploaded via v1.1 media/upload)
  - **facebook/linkedin/instagram**: stubbed with clear `not_configured` error until creds added
- Inserts a `poll_social_posts` row per platform with result

### `usePolls.ts` hook
- `useUpdatePollStatus` — when transitioning to `published` AND `auto_post=true`, invoke `generate-poll-og-image` then `post-poll-to-social` with `share_platforms`
- New `useRepostPoll(pollId, platform)` for manual buttons

## Secrets Required (X first)
Will request via secrets tool after plan approval:
- `TWITTER_CONSUMER_KEY`
- `TWITTER_CONSUMER_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_TOKEN_SECRET`

User must:
1. Create an X developer app at developer.x.com (Free tier supports posting)
2. Set app permissions to **Read and Write**
3. Generate Access Token + Secret under that app
4. Paste all four when prompted

For Facebook/LinkedIn/Instagram later, we'll add their creds in a follow-up.

## Files Touched
- `supabase/migrations/<new>.sql` — schema above
- `supabase/functions/post-poll-to-social/index.ts` — new
- `supabase/functions/generate-poll-og-image/index.ts` — new
- `supabase/config.toml` — register both
- `src/hooks/usePolls.ts` — add publish-flow chaining + repost mutation
- `src/components/admin/PollsPanel.tsx` — platform picker, auto-post toggle, caption field, repost buttons, last-posted indicator
- `src/integrations/supabase/types.ts` — regenerated after migration

## Out of Scope
- Per-admin social accounts
- Scheduling future posts
- Reading engagement metrics back (likes/retweets)
- Threaded posts / multi-tweet polls
- IG without Facebook Business linkage
