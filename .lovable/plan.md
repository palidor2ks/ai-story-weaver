# Show "Top Contributors to this PAC" for ActBlue and similar committees

## Why it's empty today

The `pacContributors` query in `src/pages/DonorProfile.tsx` reads from `public.contributions`, which has RLS restricted to admins only. For ActBlue (and any non-admin viewer) it returns 0 rows, so my "hide on empty" guard removes the section entirely.

`public.donors` is readable by all authenticated users and already contains 16,258 rows / $133M of contributions whose `recipient_committee_id = C00401224` (ACTBLUE). We just need to query the right table.

## Fix

In `src/pages/DonorProfile.tsx`, change `pacContributors` to read from `donors` instead of `contributions`:

1. **Resolve the donor's own receiving committee IDs** by prefix-ilike on `donors.recipient_committee_name` against the donor's name + display_name + alias name variations. Collect distinct `recipient_committee_id` values.
   - Optionally also use `donor_aliases.fec_committee_id` if `aliasInfo` exposes one (no extra query needed since aliasInfo is already loaded).
2. **Aggregate contributors** with a single `donors` query: `select name, display_name, type, amount, transaction_count` where `recipient_committee_id in (...)`, then group in JS by `display_name || name`, summing `amount` and `transaction_count`.
3. Sort by total amount desc, slice top 100 in the table (already does this).
4. Keep the "hide section if zero contributors" behavior so true corporations with no receiving committee stay hidden.

## Display

- Section title stays "Top Contributors to this PAC".
- Each row: contributor name (from `display_name`), contribution count, total amount — same columns as today.
- Optionally make the contributor name a link to `/donor/{id}` if we can resolve a donor id; skip linking otherwise (out of scope to add a sub-lookup).

## Out of scope

- No DB schema changes.
- No conduit-exclusion logic change. Even though ActBlue is a conduit elsewhere in the app, this section is about *who gave money to this committee*, which is exactly what the user asked for.
- No change to the "Top Recipients" section.

## Verification

- ActBlue donor profile shows top contributors (Biden For President $1.56M, Hale Robert $684K, Jacobs Irwin $336K, Diller Barry $220K, etc.).
- COINBASE still resolves to its INNOVATION PAC contributors.
- A pure organization with no receiving committee still hides the section.
