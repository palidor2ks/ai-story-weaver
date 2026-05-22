## Compact currency on committee cards

Update `formatCurrency` in `src/pages/Committees.tsx` so the "Total Raised" amount shows as `$316M` / `$4.9M` / `$750K` instead of the full `$316,109,603`.

### Logic
- `>= 1_000_000_000` → `$X.XB` (1 decimal, trim trailing `.0`)
- `>= 1_000_000` → `$XM` if ≥ $10M (no decimal), else `$X.XM`
- `>= 1_000` → `$XK`
- otherwise → `$X`

### Scope
- Only the committee card "Total Raised" value on `src/pages/Committees.tsx`.
- Tooltip on the value will show the full exact dollar amount on hover so precision isn't lost.
- No other pages (CommitteeProfile, etc.) are changed.