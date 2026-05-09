# Speed up address → officials lookup

## Why it's slow today

The Feed waits on three sequential network hops, each gated by the previous one:

```
Address
  └─► geocode-address (Census API)        ~1–3s
        └─► fetch-representatives          ~0.5–1.5s
        └─► fetch-civic-officials          ~2–4s  (Open States geo + governor + DB)
```

Open States' `people.geo` call is the single slowest hop, and `fetch-civic-officials` re-geocodes internally instead of reusing what the frontend already resolved.

## Goals

1. Cut cold-load wall time roughly in half.
2. Make repeat lookups for the same address effectively instant.
3. Make the UI feel responsive even on the first hit.

## Changes

### 1. Cache geocode + civic results in Supabase
New table `civic_lookup_cache` keyed by normalized address (uppercased, trimmed, punctuation-stripped).
Stores: `lat`, `lng`, `state`, `district`, `city`, `officials` (jsonb), `cached_at`.
TTL: 30 days (officials rarely change between elections).

- `geocode-address` checks cache first; on miss, calls Census and writes back.
- `fetch-civic-officials` checks cache first; on miss, calls Open States and writes back.
- Read is public (no PII); write only via service role inside the edge functions.

### 2. Pass lat/lng/state through instead of re-geocoding
`fetch-civic-officials` currently re-resolves the address. Update its contract to accept optional `lat`, `lng`, `state` and skip its internal geocode when provided. The frontend already has these from the geocode step.

### 3. Run reps + civic in parallel
In `Feed.tsx` (or wherever both hooks fire), trigger `useRepresentatives` and `useCivicOfficials` from the same resolved geocode result so they run concurrently rather than each doing their own geocode.

### 4. Progressive UI
Show three skeleton sections (Federal, State, Local) immediately after submit. Each section resolves independently as its query returns, so the user sees federal reps the moment they're back without waiting on Open States.

### 5. Open States timeout + graceful degradation
Wrap the Open States fetch in a 6s `AbortController` timeout. On timeout, return federal + governor + local from cache/DB and mark state legislative as "loading… retry" rather than blocking the whole response.

## Out of scope

- No changes to scoring, AI research, or candidate data.
- No new external APIs (zip-centroid fallback deferred — caching solves the common case).
- No service worker / offline support.

## Technical details

- Migration: create `civic_lookup_cache (normalized_address text primary key, lat numeric, lng numeric, state text, district text, city text, payload jsonb, cached_at timestamptz default now())` with public read RLS and service-role-only write.
- Helper `normalizeAddress(s)` shared by both edge functions: uppercase, collapse whitespace, strip trailing zip+4, drop punctuation except commas.
- Edge function changes touch only `geocode-address/index.ts` and `fetch-civic-officials/index.ts`.
- Frontend: `useCivicOfficials` accepts the geocode result from `useRepresentatives`'s shared query so both reuse the same geocode promise (via a new `useGeocode(address)` hook).
- React Query `staleTime` stays at 1 hour; the DB cache handles cross-session/cross-user reuse.

## Expected impact

- Cold first-ever address: ~3–5s → ~2–3s (parallelism + skipped re-geocode).
- Any address someone else has looked up before: ~3–5s → ~200–400ms (DB cache hit).
- Same user revisiting Feed: already instant via React Query, unchanged.
