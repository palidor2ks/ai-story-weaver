## Why the badge still doesn't show

The previous "case-insensitive" fix swapped `.in('donor_name', names)` for a single `.or(...)` of `ilike` clauses across every donor name on the page. On a candidate like Booker that has hundreds of donors per cycle, that produces a `?or=(...)` URL that is roughly 10 KB+ — past the practical PostgREST URL limit. The network panel for this exact page shows the related `donor_alias_members` request returning **"Failed to fetch"** with a similarly oversized URL. When the request fails, the cause map is empty, so `NorPac` (and every other alias) never gets a Pro-Israel badge.

The `donor_cause_overrides` `.in()` query is also case-sensitive and will only ever match `NORPAC` if an admin happened to type it in that exact casing — so that path doesn't rescue the alias either.

## What to change

The alias tables are tiny on this project: 81 active `donor_aliases` and ~800 `donor_alias_members`. Filtering server-side by hundreds of names is the wrong shape — fetch them once and resolve in JS.

### 1. `src/hooks/useDonorCauses.ts`

- Replace the per-name `.or(orFilter('donor_name', names))` query on `donor_alias_members` with a single query that pulls all members joined to active aliases that have a `primary_cause_id` set (or all of them if needed), with no name filter:
  ```ts
  supabase
    .from('donor_alias_members')
    .select('donor_name, donor_type, donor_aliases!inner(id, fec_committee_id, fec_committee_ids, is_active, primary_cause_id, cause_assigned_by, cause_ai_confidence)')
    .eq('donor_aliases.is_active', true);
  ```
  Then walk the result and match `norm(member.donor_name)` against the `inputsByNormName` map built from the page's donor names. Keep the `donor_type` membership check.

- Replace the per-name `.or(orFilter('canonical_name', names))` query on `donor_aliases` with a single fetch of all active aliases:
  ```ts
  supabase
    .from('donor_aliases')
    .select('id, canonical_name, fec_committee_id, fec_committee_ids, is_active, primary_cause_id, cause_assigned_by, cause_ai_confidence')
    .eq('is_active', true);
  ```
  Match `norm(alias.canonical_name)` against `inputsByNormName`. With only 81 rows this is cheaper than building a 10 KB URL and is shared across all candidate pages thanks to React Query's `staleTime`.

- For `donor_cause_overrides`, chunk `names` into batches of ~100 and run `.in('donor_name', batch).in('donor_type', types)` per batch using `Promise.all`. This both prevents the URL from blowing up and keeps the existing direct-override semantics. Also lowercase-compare on the client side so a casing mismatch in the override row still resolves to the right input key (use the same `inputsByNormName` trick).

- Drop the now-unused `orFilter` helper.

- Keep the existing precedence: direct override → alias-level `primary_cause_id` → committee-topic cause fallback.

### 2. Cache hygiene

Give the two new "fetch everything" queries their own React Query keys (`['donor-aliases-active']`, `['donor-alias-members-all']`) with a 5–10 minute `staleTime` so opening multiple candidate profiles doesn't re-download them.

### 3. Validation

- On `/candidate/B001288`, the NorPac row should render the green `CauseBadge` showing "Pro-Israel" next to the `PAC` chip.
- Network panel should show the new `donor_aliases` and `donor_alias_members` requests returning 200 (not "Failed to fetch") with small URLs.
- Spot-check at least one other alias-backed donor (e.g. an AIPAC or LCV row) on another candidate to confirm the new shared cache doesn't regress existing badges.
- Confirm direct `donor_cause_overrides` still apply (batched `.in()` should still match exact-casing override rows).
