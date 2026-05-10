## Why Trump's photo is missing

On the Results page, Trump appears under **Federal Executive**, which is built by the `fetch-civic-officials` edge function from the GitHub `unitedstates/congress-legislators` dataset.

Two things combine to break the image:

1. In `fetchFederalExecutiveFromGitHub` (lines ~210–235), Trump has a `bioguide` id, so `image_url` is set to:
   `https://bioguide.congress.gov/bioguide/photo/T/T000457.jpg`
   That URL now returns **HTTP 403** (verified just now). Same for VP `V000137`.
2. The unified DB image-url resolver later in the function tries to override this with the real photo we store in `candidates` / `candidate_overrides` (`https://www.whitehouse.gov/.../President-Donald-Trump-Official-Presidential-Portrait...jpg`, which loads fine, 200). But it matches by **id**, and the GitHub feed returns Trump as `T000457` while the DB row is FEC id `P80001571` — so no match. The name-based fallback only runs for officials whose `image_url` is empty, and Trump's isn't empty (it's the broken bioguide URL), so the fallback skips him too.

Result: the President/VP cards on Results render with the broken 403 URL and fall back to the colored initials avatar.

The single-candidate `/candidate/P80001571` page is unaffected (it pulls directly from `candidates`/`candidate_overrides`, which still has the working White House URL).

## Plan

Edit `supabase/functions/fetch-civic-officials/index.ts` in the unified image-url resolver only (no DB changes, no client changes):

1. **Always run the name+office fallback for federal executives**, not only when `image_url` is empty. Concretely, change the "stillMissing" filter so it also includes officials with `level === 'federal_executive'` whose current `image_url` points to `bioguide.congress.gov` (since that host is returning 403). For those, look up `candidates`/`candidate_overrides` by normalized name + office and replace with the stored URL.
2. As a small safety net, if after both passes a `federal_executive` still has a `bioguide.congress.gov` URL, clear it to empty string so the frontend's `OfficialAvatar` renders the party-colored initials fallback instead of a broken image.

That is enough to restore Trump's official White House portrait on `/results` (and on `/profile`, which uses the same data path) the next time the function's cached response expires (1-hour staleTime).

## Out of scope

- Updating the photo on the standalone `/candidate/...` page (already correct).
- Reworking the share-card flow.
- Refreshing photo URLs in the database.
