## Goal

Let admins toggle which US states are visible to end users, without deleting any underlying data. Hidden-state politicians, candidates, civic officials, donors, and feed items will simply be filtered out of all user-facing queries.

## How It Will Work

1. **New table `hidden_states`** — stores 2-letter state codes that should be hidden from users. Admins can add/remove rows freely; the underlying `candidates`, `static_officials`, `donors`, etc. stay untouched.
2. **New admin panel "Visible States"** added as a tab on `/admin`. Shows a 50-state + DC grid of toggles. Clicking a state hides/unhides it instantly.
3. **Frontend filtering** — a single `useHiddenStates()` hook fetches the hidden list (cached), and the relevant pages (`Feed`, `Candidates`, `Donors`, `Parties`, representative lookup) filter out any record whose `state` is in that list before rendering.

Because filtering happens at the read layer (not in the database), nothing is destructive — toggling a state back on instantly restores all its data.

## Plan

```text
1. Database
   └─ Create table `hidden_states` (state_code PK, hidden_at, hidden_by)
      RLS: anyone can SELECT, only admins can INSERT/DELETE

2. Admin UI
   ├─ New tab "Visible States" in src/pages/Admin.tsx
   └─ New component src/components/admin/HiddenStatesPanel.tsx
      - 51-cell grid (50 states + DC) with a Switch per state
      - Shows count of candidates/officials currently in each state
      - Toggle calls insert/delete on hidden_states

3. Shared hook
   └─ src/hooks/useHiddenStates.ts
      - Returns Set<string> of hidden state codes
      - Cached 5 min via react-query

4. Apply filter on user-facing pages
   ├─ src/pages/Feed.tsx           → filter candidates list
   ├─ src/pages/Candidates.tsx     → filter all tabs (My Reps, Federal, State, Local, All)
   ├─ src/pages/Donors.tsx         → filter donor.contributor_state
   ├─ src/pages/Parties.tsx        → filter party member rosters if applicable
   └─ src/hooks/useRepresentatives.ts → filter representatives result
```

## Technical Details

- **Table schema**
  ```sql
  CREATE TABLE public.hidden_states (
    state_code text PRIMARY KEY,           -- 'CA', 'TX', 'DC' …
    hidden_at  timestamptz DEFAULT now(),
    hidden_by  uuid REFERENCES auth.users(id)
  );
  ALTER TABLE public.hidden_states ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "anyone reads"  ON public.hidden_states FOR SELECT USING (true);
  CREATE POLICY "admins manage" ON public.hidden_states FOR ALL
    USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
  ```

- **Filter pattern** (applied in each page after data is loaded):
  ```ts
  const { hidden } = useHiddenStates();
  const visible = candidates.filter(c => !hidden.has(c.state));
  ```

- **No edge function changes** required. Existing background jobs (FEC sync, bill ingestion, etc.) keep populating data for every state — only the UI hides it.

- **Admin panel features**
  - Search/filter the state grid
  - "Hide all" / "Show all" bulk buttons
  - Live count badge per state (`SELECT state, count(*) FROM candidates GROUP BY state`)
  - Confirmation toast after each toggle

## Out of Scope

- No deletion of historical data
- No changes to scoring math, AI pipelines, or sync jobs
- Hidden states still appear in admin views (admins always see everything)

