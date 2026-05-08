## Audit Results

I checked every candidate record across both `candidates` (federal) and `candidate_overrides` (state/local) tables.

### `candidates` table — 540 / 544 have photos
Only **4 missing**, all federal executives whose IDs are FEC IDs (not bioguide), so the `bioguide.congress.gov` URL pattern used by `fetch-representatives` doesn't apply:

| Name | Office | ID |
|---|---|---|
| Donald J. Trump | President | `P80001571` |
| Joseph R. Biden Jr | President | `P80000722` |
| Kamala D. Harris | President | `P00009423` |
| JD Vance | Vice President | `V000137` |

### `candidate_overrides` table — 4 / 16 have photos
**12 missing**, breakdown:

- **7 Piscataway town council members** (Espinosa, Uhrin, Cahill, Leibowitz, Lombardi, Rashid, Carmichael) — added via static officials/manual entry, no source URL was ever populated.
- **1 mayor** (Brian Wahler, Piscataway) — `fetch-mayor` returned no `photo_url`.
- **1 state rep** (Kevin Egan) — OpenStates didn't return an image for this person.
- **3 junk override rows** with all fields NULL (`V000137`, `transition_160a16a4-…`, `federal_president`) — orphan/stale rows polluting the table.

### Why this happens (root causes)

1. **Federal executives** — `fetch-representatives` builds the photo URL from `bioguide_id[0]/bioguide_id.jpg`, but presidents/VP rows use FEC IDs (`P…`, `V…`), so the URL is never built.
2. **State legislators** — `fetch-civic-officials` reads `person.image` from OpenStates; if OpenStates has no image, `image_url` is left empty and never re-tried.
3. **Mayors** — `fetch-mayor` (AI lookup) returns `photo_url: null` for many small-city mayors and there is no fallback.
4. **Manually-added local officials** (council members, school board, etc.) — no automated photo lookup exists at all. Whoever added them via `CandidateEditDialog` left the field blank.
5. **Junk override rows** — created by some prior workflow without a name; nothing to attach a photo to.

The UI already gracefully falls back to colored party-ring initials in `OfficialAvatar`, so this is a data/coverage problem, not a UI bug.

## Proposed Solutions

### 1. Quick wins (data fix, no code) — fixes 4 federal + Mikie Sherrill style cases
Run a one-off SQL/script update with known official portrait URLs:
- Trump → `https://www.whitehouse.gov/wp-content/uploads/2025/01/Trump-portrait.jpg` (or Wikipedia Commons URL)
- Biden, Harris, Vance → equivalent official portraits / Wikipedia Commons.
- Same approach for Brian Wahler (Piscataway mayor) using the township's official site headshot.

### 2. New edge function `enrich-official-photos` — fixes the 8 local NJ officials and any future ones
A small admin-triggered function that, for each candidate (or override row) without an `image_url`:
1. Calls Lovable AI (`google/gemini-2.5-flash` with `google_search` tool, similar to `fetch-mayor`) asking for a single official portrait URL from the official government website (`*.nj.gov`, `piscatawaynj.org`, `njleg.state.nj.us`, etc.).
2. Validates the URL returns 200 + `image/*` content-type before saving.
3. Writes to `candidates.image_url` or `candidate_overrides.image_url` depending on where the row lives.
4. Logs failures so admins can manually fill from `CandidateEditDialog`.

Triggered from the existing **Admin → Civic Officials panel** with a new "Backfill missing photos" button.

### 3. Avatar upload path for claimed profiles (already partially exists)
`AvatarUpload.tsx` + `avatars` storage bucket already exist for user profiles. Extend it so a claimed politician (or admin via `CandidateEditDialog`) can upload a portrait directly, which writes to `candidate_overrides.image_url`. This is the fallback when no public source is found.

### 4. Cleanup migration — drops 3 junk override rows
Delete `candidate_overrides` rows where `name IS NULL AND office IS NULL` (the 3 phantom rows). Add a `CHECK (name IS NOT NULL)` constraint to prevent regressions.

### 5. Improve `fetch-civic-officials` retry
When OpenStates returns no `image`, fall back to the same AI-photo-lookup used in solution #2 instead of saving an empty string. This stops new local officials from landing in the database without a photo.

## Suggested Order

1. **Cleanup migration** (#4) — instant, removes noise.
2. **Quick win SQL update** (#1) — 5 minutes, fixes 4 most-visible federal officials.
3. **`enrich-official-photos` edge function + admin button** (#2) — fixes the 8 NJ local officials.
4. **Extend `fetch-civic-officials` fallback** (#5) — prevents future gaps.
5. **Avatar upload in `CandidateEditDialog`** (#3) — last-mile manual override.

## Out of Scope
- No changes to `OfficialAvatar` fallback logic — it already works.
- No mass scraping of third-party sites beyond official `.gov` domains.

## Confirm before I build

Which solutions do you want me to implement now? I'd recommend at minimum #1 + #2 + #4 to fix everything visible today. Tell me which to ship and I'll execute.
