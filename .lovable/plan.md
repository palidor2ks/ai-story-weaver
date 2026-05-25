## Goal
Port PR #83 from `ai-story-weaver` to this repo: add an admin-managed alias table so operators can override display names for top outside spenders by FEC committee ID. Aliases take precedence over `external_pacs.name` on the Top Spenders page.

## 1. Migration — `committee_aliases` table

New migration creating:
- Table `public.committee_aliases (fec_committee_id text PK, alias_name text not null, created_at timestamptz default now(), updated_at timestamptz default now())`.
- Trigger `touch_committee_aliases_updated_at` to refresh `updated_at` on update.
- RLS enabled.
- Policy: public `SELECT` (so the public Top Spenders page can read aliases).
- Policy: `ALL` restricted to `has_role(auth.uid(), 'admin')` for insert/update/delete.

Skipping the unrelated `candidate_committees` fkey tweak from the PR — that's specific to the other repo's migration state.

## 2. New panel — `src/components/admin/CommitteeAliasesPanel.tsx`

React Query panel:
- Lists existing aliases (FEC ID, alias, created_at) with a search box filtering by either field.
- Form with two inputs (FEC committee ID, alias name) + Save button → upsert on `fec_committee_id`.
- Per-row Remove button → delete by FEC ID.
- Invalidates `['committee-aliases']` and `['top-spenders']` queries on mutation.
- Uses `(supabase as any).from('committee_aliases')` since generated types regenerate after migration apply.
- shadcn `Card`, `Input`, `Button`, `Table`, `sonner` toast — matches surrounding admin panel patterns.

## 3. Wire into Admin tabs — `src/pages/Admin.tsx`

- Import `CommitteeAliasesPanel`.
- Add tab entry `{ value: "committee-aliases", label: "Spender Aliases", Icon: Tags }` next to "committee-topics" in the section list (line ~492).
- Add matching `<TabsContent value="committee-aliases"><CommitteeAliasesPanel /></TabsContent>` block after the committee-topics one (line ~796).

## 4. Apply aliases on Top Spenders — `src/pages/TopSpenders.tsx`

Update `resolveDisplayNames` (line 37) to fetch from both `external_pacs` and `committee_aliases` in parallel. Apply `external_pacs.name` first, then overlay `committee_aliases.alias_name` so aliases win when both exist.

```ts
const [{ data: externalNames }, { data: aliases }] = await Promise.all([
  supabase.from('external_pacs').select('fec_committee_id, name').in('fec_committee_id', unique),
  (supabase as any).from('committee_aliases').select('fec_committee_id, alias_name').in('fec_committee_id', unique),
]);
(externalNames ?? []).forEach((r) => { if (r.name) map.set(r.fec_committee_id, r.name); });
(aliases ?? []).forEach((r: { fec_committee_id: string; alias_name: string | null }) => {
  if (r.alias_name) map.set(r.fec_committee_id, r.alias_name);
});
```

## Out of scope
- No edge function or hook changes.
- No changes to `external_pacs` table.
- The PR's unrelated migration tweak to `candidate_committees_candidate_id_fkey` is skipped (different repo state).
