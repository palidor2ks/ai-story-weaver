## Why photos still don't show

I checked the data and the URLs themselves:

- **544/544** rows in `candidates` have an `image_url` ✅
- **5/13** rows in `candidate_overrides` have an `image_url`; **8 are still NULL** (Piscataway council members + Kevin Egan)
- The URLs we *did* set for overrides are mostly **broken when loaded from a browser**:
  - `njleg.state.nj.us/...smith_bob_2021.jpg` → connection times out (no response)
  - `piscatawaynj.org/ImageRepository/...` → **403 Forbidden** (hotlink-blocked)
  - `nj.gov/governor/...` → similar hotlink risk
- The `enrich-official-photos` edge function we added has **never been invoked** (zero logs) — the "Find Missing Photos" button was added but not run, and even if it had, it would just write more remote URLs that may also be hotlink-blocked.

That's why `OfficialAvatar` falls back to initials ("BS", "JD", "DT", etc.) — the `<img>` tag fires `onError` on every blocked/timed-out URL.

## Plan

### 1. Re-host every photo in Supabase Storage (definitive fix)
- Create/ensure a public `official-photos` storage bucket.
- Upgrade `enrich-official-photos` to:
  1. For each candidate/override missing or with a known-bad image, ask Lovable AI (`google/gemini-2.5-pro` + `google_search`) for an official `.gov` portrait URL.
  2. **Download** the image server-side (no browser CORS/hotlink issue), validate it's a real `image/*` ≥ 5 KB.
  3. **Upload** it to `official-photos/{id}.jpg` in Supabase Storage.
  4. Save the resulting **public Storage URL** (not the original) into `candidates.image_url` or `candidate_overrides.image_url`.
- This guarantees every URL we serve is fast, CORS-clean, and never disappears.

### 2. Re-process the known-broken URLs
- Mark these 4 overrides for re-enrichment so they get replaced by hosted copies: Bob Smith, Joe Danielsen, Brian Wahler, Dale Caldwell.
- Process the 8 NULL overrides: Dennis Espinosa, Frank Uhrin, Gabrielle Cahill, Kevin Egan, Laura Leibowitz, Michele Lombardi, Sarah Rashid, Sharon Carmichael.

### 3. Auto-run on demand + admin button
- Keep the existing **"Find Missing Photos"** button in `CivicOfficialsPanel`, but also expose a **"Re-host All Photos"** option that re-uploads any URL not already pointing at our Storage bucket.
- Show a per-candidate progress toast so you can see it working.

### 4. Graceful fallback (already in place)
- `OfficialAvatar` already shows party-colored initials on `onError`. No change needed; just make sure the new flow eliminates errors for the politicians you actually see.

## Technical notes
- Storage bucket: `official-photos`, public read, authenticated write via service role inside the edge function only.
- Filename convention: `{candidate_id_or_override_id}.jpg` (overwrite on re-host so URLs stay stable).
- Edge function uses `Deno.fetch` + `supabase.storage.from('official-photos').upload(..., { upsert: true })`.
- AI search restricted to: official `.gov`, state legislature, municipal, and `bioguide.congress.gov` domains; reject `wikipedia`, social media, news photos.
- Add a small DB column `image_url_source text` (optional) so we can audit where each photo came from. *(Skip if you'd rather keep the schema lean — let me know.)*

## Out of scope
- No changes to the visual avatar component.
- No bulk scraping of non-government sites.
- No user-facing upload UI (already exists separately for claimed politicians).
