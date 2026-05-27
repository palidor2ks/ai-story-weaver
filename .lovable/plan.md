## Problem

Today the "Primary Cause" column in Donor Aliases (both **Manage Aliases** and **Attach Donors** tabs) reads from `committee_topics`, which is keyed by `fec_committee_id`. Aliases with no committee ID (AIPAC, ActBlue, Adelson Miriam, etc.) just show "No committee ID" with no way to assign a cause — even though the user explicitly does not want committee ID to be required.

## Fix

Store the cause directly on the `donor_aliases` row, independent of any committee ID, and surface it across the whole platform.

### 1. Database (migration)

Add cause fields to `public.donor_aliases`:
- `primary_cause_id text` — FK to `committee_causes(id)`, nullable, `ON DELETE SET NULL`
- `cause_assigned_by text` — `'admin' | 'ai'`, nullable
- `cause_ai_confidence text` — `'low' | 'medium' | 'high'`, nullable
- `cause_ai_reasoning text` — nullable
- `cause_assigned_at timestamptz` — nullable

Reuse the existing `committee_causes` taxonomy (no new cause table). Keep RLS/grants in line with the existing `donor_aliases` policies.

### 2. New edge function: `classify-donor-alias-cause`

Mirrors `classify-committee-topic` but for an alias:
- Admin-gated (same auth pattern as `attach-donors-to-alias`).
- Input: `{ alias_id }` (or `{ alias_ids: [] }` for batch).
- Gathers context: alias `canonical_name`, attached donor member names/types, any recipient committees those donors gave to (top recipients), and — if the alias does have committee IDs — IE purposes from `independent_expenditures`.
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with the active `committee_causes` list, same tool-call JSON schema as `classify-committee-topic`.
- Writes `primary_cause_id`, `cause_assigned_by='ai'`, `cause_ai_confidence`, `cause_ai_reasoning`, `cause_assigned_at=now()` to `donor_aliases`.

### 3. Frontend — `DonorAliasesPanel.tsx`

In **both tabs**, replace the committee-topic-driven Primary Cause cell with an alias-level cell that:
- Reads `primary_cause_id` directly from the alias row.
- Renders a `<Select>` of all active `committee_causes` (admin override; writes to `donor_aliases.primary_cause_id` with `cause_assigned_by='admin'`).
- Renders an AI button (Sparkles icon) that calls `classify-donor-alias-cause` for that alias and refetches.
- Works for every alias, including those with no committee ID. The "No committee ID" message is removed from the Primary Cause column (committee ID column already shows "—" separately).

In the **Attach Donors** tab, the Primary Cause cell shows the cause of the donor's `currentAlias` (same alias-level lookup), and is editable inline for admins. Rows without an attached alias still show "Attach to alias first".

Also add an optional Primary Cause `<Select>` in the New/Edit Alias dialog so admins can set it at create time (not required).

### 4. Hook updates

- `useDonorAliases.ts`: include the new cause columns in the select; update `DonorAlias` type; add `useUpdateDonorAliasCause(aliasId, causeId, source)` mutation.
- `useDonorCauses.ts` (used by `DonorCard` / `CauseBadge` on public pages): when resolving a donor name → cause, first check the alias's own `primary_cause_id`; fall back to the existing committee-topics lookup only if the alias has no direct cause. This makes admin-assigned causes visible everywhere the badge renders, even for committee-less aliases like AIPAC and ActBlue.

### 5. Out of scope

- No changes to `committee_topics` or `classify-committee-topic` (still used for committees that do have FEC IDs).
- No schema changes to `committee_causes`.
- No changes to public donor-facing pages beyond the `useDonorCauses` resolution tweak (the badge already exists).

## Order of operations

1. Run the migration (adds cause columns to `donor_aliases`).
2. Regenerate Supabase types.
3. Add the `classify-donor-alias-cause` edge function.
4. Update `useDonorAliases.ts` + `useDonorCauses.ts`.
5. Update `DonorAliasesPanel.tsx` (both tabs + dialog).
