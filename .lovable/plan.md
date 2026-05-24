## Plan

1. **Stop hiding valid photos while conversion is pending**
   - Update `ShareProfileButton` so the share modal gets the original `candidateImage` immediately, then swaps to the base64 version if conversion succeeds.
   - Track image conversion state separately so a slow or blocked conversion does not force initials (`TM`).

2. **Add safer federal headshot fallback**
   - For Bioguide-style candidate IDs like `M001184`, generate the official Bioguide photo URL as a fallback if the candidate image is missing or fails conversion.
   - Try the provided URL first, then the Bioguide fallback.

3. **Fix the card image fallback behavior**
   - Update `CandidateStatCard` so if an image fails in the card preview, it falls back cleanly to initials rather than leaving a hidden/blank image element.

## Technical details

- The current issue is likely that `ShareProfileButton` passes `resolvedImage ?? null`, so the card only gets a photo after client-side fetch/base64 conversion succeeds. If that fetch is blocked by CORS or still pending, the modal shows initials.
- Passing the original URL first lets the visible card render the normal browser image path while preserving base64 conversion for PNG export when possible.