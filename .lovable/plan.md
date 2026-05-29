# Daily Social Stat-Card Auto-Poster

## What it does
Every day at 7pm ET, a cron job picks a rep, renders the same stat card that the **Share** button on the rep profile produces, drafts captions per platform, and creates a queued post. An admin page lets you review, edit, approve, reject, and see posted history. A global toggle switches the system between **Manual** (drafts only; nothing posts without click) and **Auto** (drafts auto-post at 7pm). Starts in Manual.

## Workflow

```text
7pm ET cron
   │
   ▼
pick-daily-stat-card  ──► choose rep + stat (rotates, skips recent)
   │
   ▼
render shareable card (reuse rep-profile share image pipeline)
   │
   ▼
generate-social-caption (per platform: X, FB, IG, TikTok)
   │
   ▼
insert row in social_posts (status = 'pending_review')
   │
   ▼
   ┌───────────────┴───────────────┐
   │ Manual mode                   │ Auto mode
   │ wait for admin Approve        │ auto-approve after N hours
   │                               │ unless admin rejects
   └───────────────┬───────────────┘
                   ▼
         post-social-card  ──► X / FB / IG / TikTok
                   ▼
         status = 'posted' + per-platform IDs/URLs
```

## Admin page: `/admin/social-posts`

Three tabs:
- **Queue** — drafts awaiting approval. Card preview, editable captions per platform, platform checkboxes, **Approve & Post Now**, **Reject**, **Regenerate caption**.
- **Scheduled / Posted** — history with timestamps, links to each platform post, re-post button.
- **Settings** — toggle Manual ↔ Auto, default posting time (default 7pm ET), per-platform on/off, source rotation rules ("which rep types to include").

Also a **Generate now** button to create a draft on demand (useful for testing without waiting for cron).

## Source: reusing the rep-profile share card
- The existing **Share** button on a rep profile page already produces a stat-card image via `upload-share-card`. The new edge function calls that same code path with a chosen rep + stat, so cards look identical to manually shared ones.
- Schema is generic (`subject_type`, `subject_id`) so we can later add `donor_profile`, `bill`, etc. without migrations.

## Platforms
- **X** — already wired (`x-post-tweet`, OAuth tokens stored).
- **Facebook / Instagram** — require a Meta app + Page access token + IG Business account. I'll stub the post functions and request the secrets when you're ready to enable.
- **TikTok** — requires TikTok Content Posting API approval (slowest). Stubbed for v1, behind the per-platform toggle.

In v1 only X actually posts; FB/IG/TikTok show in the UI as "credentials required" and stay disabled until you add the tokens.

---

## Technical details

### Database (new tables)
- `social_posts` — `id`, `subject_type` ('rep_profile'), `subject_id` (candidate id), `stat_key`, `image_path`, `image_url`, `share_url`, `status` ('pending_review' | 'approved' | 'posted' | 'rejected' | 'failed'), `scheduled_for`, `posted_at`, `created_by`, `reviewed_by`, timestamps. RLS: admins manage, service_role bypass.
- `social_post_platforms` — `post_id` FK, `platform` ('x'|'facebook'|'instagram'|'tiktok'), `caption`, `status`, `external_post_id`, `external_url`, `error`, `posted_at`. RLS same.
- `social_post_settings` — singleton row: `mode` ('manual'|'auto'), `post_time_local` (default '19:00'), `timezone` ('America/New_York'), `auto_approve_after_hours`, per-platform enabled flags.

### Edge functions
- `pick-daily-stat-card` (cron 7pm ET, `verify_jwt = false`): selects next rep using round-robin over reps not featured in last N days, picks a notable stat (score, vote, donor total), calls render + caption, inserts draft. If `mode = 'auto'`, immediately schedules `post-social-card`; otherwise leaves `pending_review`.
- `generate-stat-card-image` (or reuse existing share-card render path): produces PNG + share URL identical to the rep profile Share output.
- `generate-social-caption`: Lovable AI Gateway, plain text, per-platform length limits (X 280 incl. share URL reserved, IG/FB longer with hashtags, TikTok caption short).
- `post-social-card`: posts to each enabled platform, writes per-platform results back. For X reuses existing OAuth + media upload pattern; FB/IG/TikTok stubs return "not configured" until secrets exist.
- `social-post-actions` (admin-only, JWT verified, `has_role` check): approve, reject, regenerate caption, post now, re-post.

### Cron
Two pg_cron jobs:
1. `pick-daily-stat-card` at `0 0 * * *` UTC (= 7pm ET during EST, 8pm during EDT — or we run hourly and let the function check `post_time_local` against current ET to avoid DST drift). I'll use the hourly-with-timezone-check approach so 7pm ET stays correct year-round.
2. `auto-approve-and-post` hourly: in auto mode, finds pending drafts older than `auto_approve_after_hours` and posts them.

### Frontend
- `src/pages/admin/SocialPosts.tsx` — three-tab admin UI described above.
- `src/components/admin/SocialPostCard.tsx` — preview + per-platform editors.
- Add nav link in `src/pages/Admin.tsx`.

## Out of scope (v1)
- Real FB/IG/TikTok posting (UI + schema ready; flip on once tokens are added).
- Donor-profile / bill cards (schema is generic so we add them later by extending `pick-daily-stat-card`).
- Analytics on post performance (likes, impressions).
- Per-rep scheduling rules beyond round-robin.

## Verification
- Click **Generate now** in admin → draft appears in Queue with rendered card matching the rep-profile Share image.
- Click **Approve & Post Now** with X enabled → tweet appears, status flips to `posted`, link saved.
- Toggle to Auto mode, set `auto_approve_after_hours = 0`, run cron manually → draft posts to X without admin click.
- Switch back to Manual → next cron run only creates draft, doesn't post.
