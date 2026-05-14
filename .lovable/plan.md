## Fix donor list timeout

**Error:** `canceling statement due to statement timeout` on `/donors`.

**Cause:** In the previous turn I added a secondary `.order('display_name')` tiebreaker to the `donor_consolidated` query. With ~1M+ rows and no composite index on `(total_amount, display_name)`, Postgres falls back to a full sort and exceeds the REST statement timeout.

**Fix:** Revert the sort in `src/hooks/useDonorsPaginated.ts` to a single column order — which is what the underlying index supports.

```ts
if (sortBy === 'amount') {
  query = query.order('total_amount', { ascending: sortOrder === 'asc', nullsFirst: false });
} else {
  query = query.order('display_name', { ascending: sortOrder === 'asc' });
}
```

Leave the defensive default (`sortBy ?? 'amount'`, `sortOrder ?? 'desc'`) in `Donors.tsx` in place — that change is harmless and still ensures sort by dollar amount.

No DB migration needed.