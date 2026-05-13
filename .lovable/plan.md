## Wire up X (Twitter) + Facebook Page posting

### What you'll do (one-time setup)

**X (Twitter)** — at https://developer.x.com/en/portal/dashboard
1. Create Project + App (Free tier is fine).
2. App settings → User authentication settings → permissions = **Read and Write** → save.
3. Keys & tokens → generate **Consumer Keys** (API Key/Secret) and **Access Token + Secret** for the brand account.
4. After I trigger the secrets prompt, paste the 4 values.

**Facebook Page** — at https://developers.facebook.com
1. Create App (type: Business) and link your brand Facebook Page.
2. In Graph API Explorer (or via Business Settings), generate a **Page Access Token** with `pages_manage_posts` + `pages_read_engagement` scopes. Convert to a long-lived token via `/oauth/access_token?grant_type=fb_exchange_token`.
3. Get the Page ID (Page → About → Page ID).
4. After I trigger the secrets prompt, paste the 2 values.
   - Note: Posting to your own Page works in Dev Mode without App Review. Posting to other Pages requires App Review.

### What I'll build

**1. Edge function `post-poll-to-social/index.ts`** (already scaffolded for X — extend it)
- Replace the Facebook stub with a real implementation:
  - `POST https://graph.facebook.com/v21.0/{FACEBOOK_PAGE_ID}/feed` with `message` + `link` (the poll URL) using `FACEBOOK_PAGE_ACCESS_TOKEN`.
  - For polls with an `og_image_url`, switch to `/photos` endpoint with `url` + `caption` so the OG image is the post image.
  - Parse response → log `remote_post_id` (the returned `id`) and build `remote_post_url` = `https://facebook.com/{id}`.
  - On error, write `status='failed'` + error message into `poll_social_posts`.
- Return the same `{ results: [{ platform, status, url?, error? }] }` shape so the existing UI works.

**2. Secrets** — I'll request these via the secrets tool:
- `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`
- `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`

### Out of scope
- LinkedIn and Instagram (kept as `not_configured` stubs).
- Per-admin OAuth flows / token refresh UI.
- App Review submissions (you handle on Meta side if you want to post to Pages you don't own).
