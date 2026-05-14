## Confirm donor sort by amount

The donor list on `/donors` is already configured to sort by total dollar amount, descending, by default.

**Where this lives:**
- `src/pages/Donors.tsx` — initial state sets `sortBy: 'amount'`, `sortOrder: 'desc'`
- `src/hooks/useDonorsPaginated.ts` — query orders by `total_amount` descending when `sortBy === 'amount'`

**Proposed change (small hardening):**
1. In `useDonorsPaginated.ts`, add a deterministic tiebreaker so equal-amount donors keep a stable order: `.order('total_amount', { ascending: false }).order('display_name', { ascending: true })`.
2. In `Donors.tsx`, guarantee the default cannot be silently overridden — if `filters.sortBy` is undefined, force `'amount' / 'desc'` before passing to the hook (defensive, in case future filter resets drop the field).

No UI/visual changes. No backend schema changes.

If you instead want me to **lock** the sort to amount-desc and remove the user's ability to change it, say the word and I'll strip the sort controls from `DonorFilters`.