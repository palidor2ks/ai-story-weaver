
# Adding Images for Local Politicians

## Current State

- **Open States API** already provides `person.image` for many state legislators, and that URL is saved to `candidate_overrides.image_url` during the persist step (line 745 of `fetch-civic-officials`).
- 3 out of 4 existing civic officials already have images. The issue is that **some officials have no image from Open States** (the field comes back null/empty).
- The `OfficialAvatar` component already handles missing images with a party-colored initials fallback.

## Problem

When Open States doesn't provide an image, there's no secondary source to fill it in. This affects some state legislators and most manually-added local officials.

## Proposed Solution

### 1. Web-search image enrichment during onboarding

After persisting officials in `fetch-civic-officials`, for any official missing an image, use a web search to find an official headshot.

- Add a step in `persistAndResearchOfficials()` that checks for officials with empty `image_url`
- For each, query a search API (Google Custom Search or similar) for `"{name}" {office} {state} official photo`
- Save the first relevant result to `candidate_overrides.image_url`

### 2. Manual image upload in admin panel

Add an image upload/URL input to the `CivicOfficialsPanel` so admins can manually set or override images for any civic official.

- Add an edit dialog or inline URL input per official
- Update `candidate_overrides.image_url` on save
- Optionally support uploading to the existing `avatars` Supabase storage bucket

### 3. AI research image enrichment (alternative/complementary)

During the `populate-civic-answers` AI research step, also attempt to find an official photo URL and save it.

---

## Recommendation

**Start with option 2 (manual admin upload)** since it's the most reliable and doesn't require additional API keys. Then optionally layer on option 1 or 3 for automation.

## Technical Changes

1. **`CivicOfficialsPanel.tsx`** — Add an image column showing the current photo (or initials fallback) and a button to edit the image URL or upload a file to the `avatars` bucket.

2. **`candidate_overrides`** — Already has `image_url` column, no schema change needed.

3. **(Optional) `fetch-civic-officials/index.ts`** — Could add a Google image search fallback for officials with no `person.image` from Open States, but this requires a Google Custom Search API key.

No database migration needed — `image_url` already exists on `candidate_overrides`.
