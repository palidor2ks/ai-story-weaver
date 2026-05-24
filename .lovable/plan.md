# Fix committee search error

## Problem

Searching "israel" (or any text) on `/committees` fails with:

> Unable to load committees: "failed to parse logic tree ((name.ilike.%israel%,fec_committee_id.ilike.%israel%,candidates.name.ilike.%israel%))" (line 1, column 67)

## Root cause

In `src/hooks/useCommittees.ts` line 305, the search filter mixes a column on the base table with a column on an embedded relation inside a single top-level `.or()`:

```ts
committeeQuery.or(
  `name.ilike.%${search}%,fec_committee_id.ilike.%${search}%,candidates.name.ilike.%${search}%`
);
```

PostgREST does not allow referencing an embedded resource column (`candidates.name`) as a sibling term inside a base-table `or()` — it tries to parse `candidates.name.ilike...` as a column on `candidate_committees` and fails. Filtering an embedded resource requires `.or(..., { foreignTable: 'candidates' })`, which would filter *which candidates get embedded* rather than which committees match — a different query shape.

The search input also isn't escaped, so values containing `,` `(` `)` would break the logic tree even after the fix.

## Fix (Step 1 — narrow, ships the fix)

Restrict the `.or()` to columns that actually live on `candidate_committees`:

```ts
const safe = search.replace(/[,()*]/g, ' ').trim();
if (safe) {
  committeeQuery = committeeQuery.or(
    `name.ilike.%${safe}%,fec_committee_id.ilike.%${safe}%`
  );
}
```

This removes the invalid `candidates.name.ilike...` term and sanitizes the input. The search bar will match committee name and FEC committee ID — covering the vast majority of real searches (e.g., "israel" matches committee names containing the word).

## Fix (Step 2 — optional, adds candidate-name search back)

If we still want "search by the candidate the committee belongs to":

1. Run a parallel lookup: `supabase.from('candidates').select('id').ilike('name', `%${safe}%`)` → array of candidate IDs.
2. Combine into the committee query as:
   ```ts
   committeeQuery.or(
     `name.ilike.%${safe}%,fec_committee_id.ilike.%${safe}%,candidate_id.in.(${ids.join(',')})`
   );
   ```
   (skip the `candidate_id.in.()` term when the lookup returns zero rows).

Step 2 is only needed if product wants candidate-name search on this page — Step 1 alone unblocks the user.

## Files touched

- `src/hooks/useCommittees.ts` — line ~305 only

## Out of scope

- TopSpenders page (uses a different code path, no error there).
- Reworking the committees search UX or adding a separate "search by candidate" filter.
