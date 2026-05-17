# Fix: Musk shows up twice on Donors page

## Root cause

The consolidated donor cards are produced by two materialized views:
- `private.donor_consolidated_mv` (per cycle)
- `private.donor_consolidated_all_mv` (across cycles)

Both group rows by **exact `display_name` string**. In the current data there are two casings of the same alias target:

| display_name | type        | rows | total      |
|--------------|-------------|------|------------|
| `Musk, Elon` | Individual  | 84   | $303.7M    |
| `Musk, Elon` | Organization (Elon Musk Revocable Trust) | 3 | $23.5M |
| `MUSK, ELON` | Organization (United States of America Inc) | 3 | $52.0M |
| `Musk, Elon` | Individual (variants: REEVE, MR., R MR) | 3 | ~$324K |

Because `"Musk, Elon" <> "MUSK, ELON"` at the byte level, the matview emits two separate cards. That's the second tile you circled.

## Fix

Make consolidation case-insensitive and pick a single canonical casing per group.

### 1. Update both matviews

Group by `lower(display_name)` and choose the display label as the most-frequent / largest-amount casing.

```sql
-- private.donor_consolidated_all_mv
SELECT
  md5(coalesce(cycle,'') || '|' || lower(coalesce(display_name, name))) AS row_id,
  cycle,
  -- canonical label = casing tied to the largest single-row amount
  (array_agg(coalesce(display_name, name) ORDER BY amount DESC NULLS LAST))[1] AS display_name,
  min(id) AS primary_id,
  array_agg(DISTINCT type ORDER BY type) AS types,
  (array_agg(type ORDER BY amount DESC NULLS LAST))[1] AS type,
  array_agg(DISTINCT name ORDER BY name) AS name_variations,
  sum(amount) AS total_amount,
  sum(coalesce(transaction_count,1)) AS total_transactions,
  count(DISTINCT candidate_id) AS recipient_count,
  (count(DISTINCT name) > 1
    OR (array_agg(coalesce(display_name, name) ORDER BY amount DESC NULLS LAST))[1] <> min(name)
  ) AS is_consolidated,
  ((array_agg(coalesce(display_name, name) ORDER BY amount DESC NULLS LAST))[1]
    || ' ' || string_agg(DISTINCT name, ' ' ORDER BY name)) AS search_text
FROM donors d
GROUP BY cycle, lower(coalesce(display_name, name));
```

Apply the same `lower(display_name)` grouping change to `private.donor_consolidated_mv` (the per-cycle one — same shape, no `cycle` column in its outer projection but same `GROUP BY display_name` pattern needs to become `GROUP BY lower(display_name)` with the same canonical-label logic).

### 2. Refresh both matviews

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv;
REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_all_mv;
```

### 3. (Optional, recommended) Normalize alias `canonical_name` writes

In the alias resolution code path that sets `donors.display_name`, normalize whatever casing the admin enters to a single canonical form (e.g. title-case "Musk, Elon") so new imports don't reintroduce the split. Single line change in the alias apply function — not strictly required for the fix but prevents recurrence.

## Out of scope

- DonorProfile page rendering
- Alias UI changes
- Score / analysis logic

## Verification

After migration + refresh, on `/donors` searching "musk":
- Expect **one** Musk, Elon card showing ~$379M total, ~5 name variations, types = `[Individual, Organization]`, and the United States of America Inc / Elon Musk Revocable Trust rows merged into it.
