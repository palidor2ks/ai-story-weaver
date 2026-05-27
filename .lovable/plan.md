## Why the Spender Aliases panel doesn't work

Two independent bugs make the panel silently fail:

1. **`committee_aliases` table has zero Data API grants.** The table has correct RLS policies ("public read", "admin write"), but PostgREST also requires SQL `GRANT` privileges. Currently no role (`anon`, `authenticated`, `service_role`) has any privilege on the table, so every `select` / `insert` / `update` / `delete` from the client returns a permissions error. The table is empty because no row has ever been allowed to insert. This is the same class of bug we just fixed for `ie_excluded_committees`.

2. **"Attach Spenders" tab queries a table that doesn't exist.** `CommitteeAliasesPanel.tsx` line 116 reads `from('committees')` — there is no `public.committees` table in this project. Committee metadata lives in `external_pacs` (and `candidate_committees`). The search always errors and returns nothing.

## Fix

### 1. Migration — grant Data API access

```sql
GRANT SELECT ON public.committee_aliases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_aliases TO authenticated;
GRANT ALL ON public.committee_aliases TO service_role;
```

RLS already restricts writes to admins via `has_role(auth.uid(),'admin')`, so granting `INSERT/UPDATE/DELETE` to `authenticated` is safe.

### 2. Frontend — fix the Attach Spenders search

In `src/components/admin/CommitteeAliasesPanel.tsx`, change the committee search query from the missing `committees` table to `external_pacs`, which has `name`, `fec_committee_id`, and `treasurer_name`:

```ts
.from('external_pacs')
.select('name, fec_committee_id, treasurer_name')
.or(`name.ilike.%${safe}%,fec_committee_id.ilike.%${safe}%`)
.order('name', { ascending: true })
.limit(30);
```

(Optionally union with `candidate_committees` later if admins need to alias principal committees too — out of scope for this fix.)

### 3. Verify

- Open Admin → Spender Aliases, create a new alias (e.g. canonical "Senate Majority PAC", FEC IDs `C00484642`) and confirm it appears in the table.
- Switch to "Attach Spenders", search "majority", confirm matching `external_pacs` rows appear and "Attach ID" works.
- Visit `/top-spenders` and confirm the aliased committee shows the new canonical name.

No other code or rollup views need changes — `TopSpenders.tsx` already reads `committee_aliases` with `is_active` + `overlaps` and overrides the displayed name.
