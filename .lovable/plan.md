## Problem

Donald Trump's record exists in `static_officials` (id `P80001571`), but the stored `image_url` (a Wikipedia thumbnail) returns HTTP 400 — so no photo renders on `/feed`.

## Plan

1. **Download the official 2025 White House portrait** of Donald Trump from a reliable source (whitehouse.gov / Wikimedia Commons full-resolution URL, not a broken thumb path).
2. **Upload it to the `official-photos` Supabase storage bucket** as `P80001571.jpg` (matches the convention used by `enrich-official-photos`), with a cache-busting `?v=` query string.
3. **Update `static_officials.image_url`** for `P80001571` to the new public URL via a migration (so the change is permanent and re-runnable).
4. Verify on `/feed` that Trump's avatar now loads instead of falling back to initials.

No frontend code changes needed — `OfficialAvatar` already handles the URL.
