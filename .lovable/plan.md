## Goal

Use `https://www.piscatawaynj.org/government/elected_officials/` as the canonical source for Piscataway, NJ elected officials. Pull photo, bio, contact info, and term dates for the 8 officials already in `static_officials`, and re-use this scraper any time data needs refreshing.

## What's already there

All 8 officials exist in `static_officials` (mayor + 7 council members), but `image_url`, `website_url` are NULL and there are no columns for bio/contact/terms.

## Changes

### 1. Schema — extend `static_officials`

Add nullable columns:
- `bio` (text) — short "about" paragraph
- `email` (text)
- `phone` (text)
- `term_start` (date)
- `term_end` (date)
- `source_url` (text) — official profile page used as source
- `source_last_fetched_at` (timestamptz)

### 2. New edge function: `scrape-piscataway-officials`

- Hardcoded mapping of `static_officials.id` → profile page URL (8 entries, taken from the index page).
- For each row: fetch the page HTML, extract photo (look for `<img>` near the name in the main content area), bio paragraphs, email (`mailto:` link), phone, and term language ("Term expires …"). 
- Download the photo, upload to existing `official-photos` Storage bucket (re-uses `enrich-official-photos` pattern), store the public URL in `image_url`.
- Update the row with all extracted fields, `website_url` = profile page, `source_url` = profile page, `source_last_fetched_at = now()`.
- Logs per-official success/failure; returns a summary JSON.

### 3. Admin trigger

Add a small "Refresh Piscataway officials" button to the existing admin officials/data section (same area as other manual refresh buttons) that invokes the new function. No UI for picking towns — function is Piscataway-specific by design.

### 4. Re-use as the canonical source going forward

- `populate-civic-answers` already reads `static_officials`. Once `bio`/`source_url` exist, it will naturally have richer context. No code change required there now.
- Future updates: re-run the function from the admin button; idempotent upserts keep the rows fresh.

## Out of scope

- Generic multi-town scraper (deferred — site layouts differ).
- Changing scoring or quiz logic.
- Auto-scheduling: refresh stays manual via the admin button.

## Files touched

- migration: add 7 columns to `static_officials`
- new: `supabase/functions/scrape-piscataway-officials/index.ts`
- edited: admin page (one button + invoke handler)
