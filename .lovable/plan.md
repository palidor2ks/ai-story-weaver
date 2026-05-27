## Problem

BLITZ CANVASSING LLC shows up as a top "donor" on Trump's committee with ~$1.9M. It's actually a vendor refund (FEC line 15), not a contribution. The committee donor query in `src/hooks/useCommittees.ts` already filters out names in the `vendor_refund_organizations` table, but `BLITZ CANVASSING` isn't in that list yet — so it leaks through.

The donors list on `/donors` and the donor profile also pull from `donors`/`contributions` and would benefit from the same exclusion.

## Fix

1. **Migration**: Insert `BLITZ CANVASSING` into `public.vendor_refund_organizations` with `is_active = true`. Using the shorter token so it matches both `BLITZ CANVASSING` and `BLITZ CANVASSING LLC` (the existing filter uses `includes()` on uppercased name).

   ```sql
   INSERT INTO public.vendor_refund_organizations (name, is_active)
   VALUES ('BLITZ CANVASSING', true)
   ON CONFLICT (name) DO UPDATE SET is_active = true;
   ```

2. **No code changes needed** — `useCommitteeDonors` already consults this table and filters matches out. The committee page will drop Blitz Canvassing on next refresh.

## Out of scope

- Not touching line-number filters (`15`, `11AI`, etc.) — that was previously reverted per your instruction.
- Not adding a broader vendor heuristic; just this one entry as requested.

If `/donors` (the global list) still shows Blitz Canvassing after this, that page reads from the `donors` table directly and would need a separate exclusion pass — say the word and I'll extend the fix there too.
