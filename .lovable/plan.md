## Why NorPac has no "Primary cause" badge

The donor card calls `useDonorCauses` with the displayed name `NorPac` / type `PAC`. The hook tries three lookups:

1. `donor_cause_overrides` — no row for NorPac.
2. `donor_alias_members` — there are 8 member rows, but they are stored as `NORPAC`, `NOR PAC`, `NORPAC LLC`, etc. The query uses `.in('donor_name', ['NorPac'])`, which is case-sensitive in Postgres, so nothing matches.
3. `donor_aliases` canonical-name lookup — `canonical_name = 'NorPac'` does exist with `primary_cause_id = 'pro-israel'`. This is the path that should produce the badge.

But the canonical-name query in `src/hooks/useDonorCauses.ts` currently selects:

```ts
.select('canonical_name, donor_type, donor_types, fec_committee_id, ...')
```

`donor_aliases` has no `donor_type` or `donor_types` columns (confirmed via `information_schema`). PostgREST returns a 400, and the hook does `if (canonicalErr) throw canonicalErr;` — so the entire causes query errors out for any donor that relies on canonical-name matching, including NorPac. Donors whose causes resolve via `donor_alias_members` + `committee_topics` survive because that path runs before the broken query, which is why most rows still render their badge.

## Fix

In `src/hooks/useDonorCauses.ts`, the canonical-alias query:

- Drop `donor_type` and `donor_types` from the `.select(...)` — they don't exist on `donor_aliases`.
- Since the alias row no longer carries type info, the existing `aliasMatchesType(alias, input.type)` call will see an empty type set and return `true` (its documented fallback), so NorPac (PAC) will match its canonical alias and inherit `primary_cause_id = 'pro-israel'` → the "Pro-Israel" cause badge renders.
- No schema change, no other call sites affected.

### Technical notes

- File: `src/hooks/useDonorCauses.ts`, the `canonicalAliases` block (~lines 120-135).
- Keep `is_active`, `fec_committee_id`, `fec_committee_ids`, `primary_cause_id`, `cause_assigned_by`, `cause_ai_confidence` in the select.
- Optional follow-up (not required for this fix): also lowercase/uppercase-normalize names before `.in('donor_name', names)` on `donor_alias_members` so case-variant displays still hit member rows. Out of scope unless you want it bundled.
