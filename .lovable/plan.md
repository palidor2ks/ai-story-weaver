## Goal

Add Mayors as a new class of politician that:
1. Is auto-fetched from an external source per US city (no manual data entry)
2. Is matched to users by **city** parsed from their address
3. Appears in: (a) the user's local representatives panel, (b) the global Candidates browse list, and (c) the AI quiz-answer research pipeline

## Reality check on data sources

There is **no free, reliable, comprehensive US mayors API**. Options:
- **Google Civic API** — `representativeInfoByAddress` was shut down in April 2025. Not viable.
- **OpenStates** — state legislators only, no mayors.
- **Ballotpedia/Wikipedia scraping** — possible but brittle and ToS-risky.
- **Perplexity `sonar` deep research** — already integrated, can resolve "Who is the current mayor of {city}, {state}?" with a sourced answer. Reliable for the ~300 cities with >50k people; cacheable.

**Recommended approach: Perplexity-backed auto-fetch with city-level caching in `static_officials`.** Treat Perplexity as the "API." When a user looks up an address in a city we don't have a mayor for yet, we trigger a background research job; the result is cached and reused for every other user in that city.

## Architecture

```text
User enters address
    │
    ▼
geocode-address ──► city + state
    │
    ▼
fetch-civic-officials
    ├── existing federal/state/local lookups
    └── NEW: getMayorForCity(city, state)
            │
            ├── hit  ─► return cached static_officials row (level='local', office='Mayor', city=...)
            └── miss ─► enqueue fetch-mayor edge function (background)
                        │
                        ▼
                  Perplexity sonar research
                        │
                        ▼
                  Insert static_officials row + trigger populate-civic-answers
```

## Database changes

Add a `city` column to `static_officials` so mayors can be filtered by city, not just state:

- `city text` (nullable; only set for Mayor rows)
- Composite index on `(state, city, level)` for fast lookups
- Backfill: existing local rows get `city = NULL` (still surfaced state-wide as today)

Add a `mayor_fetch_queue` table to deduplicate concurrent lookups for the same city:
- `state`, `city`, `status` (pending/done/failed), `last_attempted_at`, `error`
- Unique on `(state, city)`

## New edge function: `fetch-mayor`

- Input: `{ state, city }`
- Looks up cached `static_officials` row → returns it if found.
- Otherwise calls Perplexity `sonar-deep-research` with a strict JSON schema:
  - `{ name, party, took_office_date, official_website, photo_url, source_urls[] }`
- Validates output (name non-empty, party in enum, ≥1 source URL).
- Inserts a row in `static_officials` with id `mayor_{state}_{city_slug}`, `level='local'`, `office='Mayor of {City}'`, `city`, photo, website, party.
- Optionally triggers `populate-civic-answers` for this new candidate.
- Uses `EdgeRuntime.waitUntil()` for the slow Perplexity call so the user request returns instantly.

## Updates to existing code

**`supabase/functions/geocode-address/index.ts`**
- Already returns state. Add `city` to response (Census geocoder returns it; expose it).

**`supabase/functions/fetch-civic-officials/index.ts`**
- Parse `city` from geocode response.
- In `fetchLocalOfficialsFromDB`, filter by `state AND (city = userCity OR city IS NULL)` so Mayor rows are city-scoped.
- After fetching, if no Mayor row exists for `(state, city)`, fire-and-forget invoke `fetch-mayor`.

**`src/hooks/useRepresentatives.ts` and `useCivicOfficials.ts`**
- No interface change needed — Mayor flows through the existing `local` bucket.

**`src/pages/Candidates.tsx` (browse list)**
- Already merges `static_officials` via `useInvertedScoreCandidates` / `useCandidates`. Confirm the Local filter chip surfaces mayors. Add a "Local" level filter if missing.

**Admin → Static Officials tab** (`src/pages/Admin.tsx`)
- Add a `city` field to the create/edit form.
- Add a "Refresh from AI" button per row that re-runs `fetch-mayor` to update photo/party.

**AI quiz-answer research**
- `populate-civic-answers` already accepts any `candidate_id` from `static_officials`. Mayors will be picked up automatically once inserted. Add Mayor to the local-scope topic/question mapping (they should answer the 5 local topics, not the 12 federal).

## User-facing behavior

- First user in a new city sees: "Looking up your mayor…" placeholder card; Mayor populates within ~30s.
- Subsequent users in that city get the Mayor instantly from cache.
- Admin can review, edit, override, or delete any auto-fetched mayor in the existing Static Officials tab.

## Out of scope (could come later)

- City Council members, school board, sheriff (same pattern, but each adds a new lookup).
- Mayor election history / challengers.
- Photo hosting (we'll just store the source URL Perplexity returns; broken photos fall back to the avatar placeholder).

## Open question to confirm before building

Perplexity costs roughly $0.005–0.05 per deep-research call. With ~30k US cities, the worst case is small (~$300 one-time, then cached forever). OK to proceed with Perplexity as the source, or do you want to limit it to cities above a population threshold (e.g. 25k+)?
