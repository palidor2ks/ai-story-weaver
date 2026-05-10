The duplicate is still happening because the current Feed dedup compares `name + office/state/district`, but the two records do not normalize to the same seat:

- Existing profile: `Frank Pallone, Jr.` / `Representative` / `NJ` / likely no district
- Upcoming candidate: `PALLONE, FRANK JR` / `U.S. House NJ-06` / `NJ` / possibly `06`

So one key becomes roughly `pallone + house|nj|` and the other becomes `pallone + house|nj|06`. Since the existing representative record has no district value, the dedup does not treat them as the same person/seat.

Plan:
1. Update Feed dedup normalization so congressional districts can be extracted from either the `district` field or the office label (`U.S. House NJ-06`, `NJ-06`, `District 6`, etc.).
2. Add a fallback match for the same normalized person + chamber + state when one side is missing a district, so incumbents like Frank Pallone merge instead of duplicating.
3. Keep the safer district-specific comparison when both sides have districts, so different House candidates in different districts do not collapse incorrectly.
4. Remove the unused `unifiedCandidateNameKey` import if it is no longer needed.

Technical notes:
- This stays frontend-only in `src/pages/Feed.tsx`.
- No database/schema changes are needed.
- The displayed card should keep the existing representative profile as the canonical one and suppress the duplicate upcoming candidate card.