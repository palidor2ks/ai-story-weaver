Root cause found: the edge function is querying the wrong FEC base URL (`api.data.gov/fec/...`), which returns 404. The code catches that failure and silently converts it to an empty result, so refresh says it ran but persists nothing. Google Civic also often returns no ballot contests until close to an election, so FEC is the important source for midterms.

Plan:
1. Update `fetch-upcoming-elections` to use the working FEC API endpoint: `https://api.open.fec.gov/v1/candidates/search/`.
2. Add explicit FEC response logging for non-OK responses so future 404/401/rate-limit/API-key issues are visible in edge logs instead of silently becoming `0` rows.
3. Keep the existing Refresh button and `force: true` behavior unchanged.
4. Validate by calling `fetch-upcoming-elections` for NJ-06 with `force: true` and confirming rows are persisted into `elections` / `election_candidates`.