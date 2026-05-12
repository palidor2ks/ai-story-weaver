## Problem

Clicking the Trump card opens Joe Biden's profile.

The Trump card from the civic-officials list uses the synthetic id `federal_president`. In `useCandidate` (`src/hooks/useCandidates.ts` ~lines 248-258), that id resolves by querying:

```
candidates where office='President' AND is_incumbent=true ORDER BY last_updated DESC LIMIT 1
```

In the DB today:
- `P80000722` Joseph R. Biden Jr — `is_incumbent=true`
- `P80001571` Donald J. Trump — `is_incumbent=false`
- `P00009423` Kamala Harris — `is_incumbent=false`

So the resolver returns Biden, regardless of which card was clicked. (VP side is fine: JD Vance is the only `is_incumbent=true` for "Vice President".)

## Fix

Two-part fix:

1. **Data correction (migration).** The current incumbent President is Trump, not Biden.
   - `candidates`: set `is_incumbent=true` where id `P80001571` (Trump); set `is_incumbent=false` where id `P80000722` (Biden) and `P00009423` (Harris).
   - This makes the existing synthetic resolver return the correct row.

2. **Resolver hardening** in `src/hooks/useCandidates.ts` (`federal_president` / `federal_vice_president` branch). To prevent a recurrence if `is_incumbent` flags drift, fall back deterministically: if zero or more than one incumbent matches, pick the row whose id matches the current `static_officials` / civic-officials entry for that office (the same source the card was rendered from). Concretely: look up `static_officials` where `level='federal_executive'` and `office` matches, then resolve to its linked candidate id; only fall back to the `is_incumbent` query if no static official exists.

## Out of scope

- No UI changes to the card itself.
- No changes to scoring or finance logic.

## Verification

- On `/admin` (or anywhere the Trump card appears), clicking Trump routes to Trump's profile (`P80001571`), and clicking Biden (if shown) routes to Biden.
- VP card still routes to JD Vance.
- Quick `select id, name, is_incumbent from candidates where office='President'` confirms only Trump is flagged incumbent.