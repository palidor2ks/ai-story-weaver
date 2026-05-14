## Change

Rebuild `private.donor_consolidated_all_mv` to group by `display_name` only (drop `type` from the GROUP BY). One AIPAC row → ~$36M, 280 recipients, types chip = `Organization, PAC`.

## Migration

Drop and recreate the MV:

- `sums` CTE: `SUM(total_amount)`, `SUM(total_transactions)`, `SUM(recipient_count)`, `bool_or(is_consolidated) OR count(*)>1`, `string_agg(DISTINCT search_text)` — `GROUP BY display_name`.
- `primary_ids`: `DISTINCT ON (display_name)` ordered by `total_amount DESC` — picks the dominant primary id and its type as the row's `type` (used by sort/legacy callers).
- `names`: distinct unnest of `name_variations` grouped by `display_name`.
- `types_agg`: distinct unnest of `types` grouped by `display_name` → `types` array.
- Final SELECT joins on `display_name`.

Indexes:
- `UNIQUE INDEX ... (display_name)` (was `(display_name, type)`).
- `INDEX ... (total_amount DESC NULLS LAST)`.

Re-grant `SELECT` to `anon, authenticated, service_role`.

## Verification

After refresh:
- AIPAC: single row, ~$36M, 280 recipients, types includes Organization + PAC.
- Spot-check Musk and a few others remain correct.

## Out of scope

- Per-cycle MV (`donor_consolidated_mv`) — still grouped by type per cycle.
- Frontend formatting and the donor alias system (option 2).