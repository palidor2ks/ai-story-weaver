
# Fix State/Local Official Filtering

## Problem
Two bugs in `fetch-civic-officials` edge function are causing incorrect results:

1. **per_page=100 is invalid** for Open States API (max is 50). The API returns a 400 error, so zero state legislators (State Senator, State Representative/Assemblyperson) are being returned. This is why Dale Caldwell (likely cached from an earlier session) appeared instead of the correct officials.

2. **Geocoding returns undefined coordinates** — the function falls back to the less precise jurisdiction-wide endpoint, which would return ALL officials for the state rather than just those for the user's district.

## Plan

### 1. Fix Open States per_page limit
In `supabase/functions/fetch-civic-officials/index.ts`, change `per_page=100` to `per_page=50` on the jurisdiction endpoint (line 335). This aligns with the existing memory rule ([OpenStates Pagination](mem://technical/open-states-api-pagination-constraint)).

### 2. Fix geocoding fallback
The `geocodeAddress` function uses the Google Places API key (`GOOGLE_PLACES_API_KEY`), but the geocode endpoint may need a different key or the key may not have the Geocoding API enabled. Add logging to diagnose, and ensure the geo endpoint is used when coordinates are available so only district-specific officials are returned.

### 3. Ensure Feed and Profile use the same data
Both pages already call `useCivicOfficials(profile?.address)` — once the edge function returns correct data, both pages will show the same officials. No frontend changes needed.

### Files changed
- `supabase/functions/fetch-civic-officials/index.ts` — fix per_page and geocoding
