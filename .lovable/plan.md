## Issue
Your current request is for `13 ORION PL, COLONIA, NJ, 07067`, and the Edge Function correctly extracts `City: COLONIA`. The response still includes Piscataway officials because the final combined officials list includes both city-filtered `static_officials` rows and unfiltered/incorrectly retained `candidate_overrides` rows.

## Plan
1. Tighten `fetchManualCivicOverrides` so local `candidate_overrides` are kept only when their matching `static_officials.city` exactly matches the user's city.
   - If a local override has a matching static official for a different city, drop it.
   - If a local override has no matching static official and appears city-specific from its office/id, drop it unless it matches the user's city.
   - Keep state-level officials like Governor statewide.

2. Add a final de-duplication and city-safety pass before returning the Edge Function response.
   - Prefer one record per official ID.
   - For `level === 'local'`, remove any record whose static city does not match the extracted city.
   - This protects against leakage from any source, not only manual overrides.

3. Bump the frontend React Query cache key for `useCivicOfficials` so your browser does not keep showing the old cached mixed response.

## Expected result
For a Colonia address, the Local Officials section should show only Colonia local officials. For a Piscataway address, it should show only Piscataway local officials. State and federal officials remain unchanged.