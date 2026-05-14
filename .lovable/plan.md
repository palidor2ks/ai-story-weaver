## Diagnosis

Her card on `/donors` shows **$179.2M / 7 recipients** (aggregated from `donor_consolidated_mv`). Her profile at `/donor/fec-00718aecbb0dba76777a534b5a5f5d2c` shows **$0 / 0 / 0** because the profile's `donorRecords` query in `src/pages/DonorProfile.tsx` returns nothing for any name containing a comma.

The query (line 235–238) uses PostgREST's `.or()` filter:

```ts
query.or(`name.eq.${donor.name},display_name.eq.${donor.name}`)
// becomes: name.eq.ADELSON, MIRIAM,display_name.eq.ADELSON, MIRIAM
```

PostgREST treats every comma in `.or()` as a clause separator, so this is parsed as four broken clauses and matches 0 rows. With `donorRecords.length === 0`, the contributions query is gated off (`enabled: !!donor?.name && donorRecords.length > 0`) and every downstream stat renders as 0.

This bug predates the all-cycles aggregation; it has always affected donors whose names contain commas (i.e. nearly every "LAST, FIRST" individual donor). It's just more visible now because the aggregated card is the natural entry point.

## Fix

In `src/pages/DonorProfile.tsx`, escape values passed to `.or()` by wrapping them in double quotes (PostgREST's quoting syntax). One small helper, applied to both branches that use `.or()`:

```ts
const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

if (aliasInfo?.canonical_name) {
  query = query.or(`name.eq.${q(donor.name)},display_name.eq.${q(aliasInfo.canonical_name)}`);
} else {
  query = query.or(`name.eq.${q(donor.name)},display_name.eq.${q(donor.name)}`);
}
```

That's the only change. Once `donorRecords` populates, the existing contributions query (which uses `.in('contributor_name', donorNames)` and already handles commas correctly) will hydrate Top Recipients, Contribution History, and the four header stat tiles.

## Out of scope

- No DB / RPC changes
- No changes to the alias-pattern path (uses `.ilike`, not `.or`)
- No changes to the donors list page
