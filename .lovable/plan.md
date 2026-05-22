## Apply donor aliases to Committee profile "Top Contributors"

### Why they differ today

- **Donors page** (`/donors`) calls the RPC `get_donors_paginated`, which groups by the canonical alias (`donor_aliases.canonical_name` via `donor_alias_members`). That's why "ADELSON, MIRIAM" + "ADELSON, MIRIAM DR." collapse into one row.
- **Committee profile Top Contributors** (`useCommitteeDonors` in `src/hooks/useCommittees.ts`, line 506) groups by raw `contributions.contributor_name + state + city`. It never consults `donor_aliases` / `donor_alias_members`, so every spelling variant shows as its own row and the alias display name is ignored.

### Change

Update `useCommitteeDonors` in `src/hooks/useCommittees.ts` to apply the same alias collapsing the donor list uses:

1. After fetching the up-to-500 `contributions` rows for this committee+cycle, collect the distinct `contributor_name` values (uppercased/trimmed for matching).
2. Single query against `donor_alias_members` filtered by those names, joining to `donor_aliases` where `is_active = true`, returning `donor_name`, `alias_id`, `canonical_name`. Build a `Map<rawName, { aliasId, canonicalName }>`.
3. Group rows by:
   - `aliasId` when a match exists → display the alias's `canonical_name`
   - else fall back to current `name + state + city` key (raw name preserved)
4. Sum `totalAmount`, `contributionCount`, latest date, candidate names across all variants. Show the canonical name as `name`.
5. For city / state / occupation / employer on collapsed rows, keep the values from the highest-amount contribution (so the card still has location/occupation context — currently it just takes the first row).

No schema, RPC, or RLS changes. No edits to the donor list, the Committees list, or finance rollups. Just this hook.

### Out of scope

- Donor type filtering on the committee page (still shows all contributor types as-is).
- Cross-committee alias scoping (`donor_aliases.fec_committee_id` / `fec_committee_ids`): for v1 we treat any active alias as global, matching how the Donors page consolidates. If you want committee-scoped aliases only, say so and I'll filter on `fec_committee_id IS NULL OR <this committee's FEC id> = ANY(fec_committee_ids)`.
- The 500-row contribution cap stays. (Aliases let us show more *unique* donors within the same 500, but if you want the cap raised, flag it.)
