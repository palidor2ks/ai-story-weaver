# Show committee primary cause on Top Spenders rows

## What

Under each committee name in `/top-spenders`, render the committee's primary cause as a small badge (e.g. "Pro-Trump / MAGA", "Conservative (general)"), pulled from `committee_topics.primary_cause_id → committee_causes.label`.

## Why

Right now rows show only the committee name and FEC ID. The platform already classifies committees into causes (verified for FF PAC → "Progressive (general)", MAKE AMERICA GREAT AGAIN INC. → "Pro-Trump / MAGA", etc.), but Top Spenders doesn't surface it.

## Implementation

In `src/pages/TopSpenders.tsx`:

1. **Add a batched lookup** alongside the existing `raisedMap` query:
   ```ts
   const { data: causeMap } = useQuery({
     queryKey: ['top-spenders-causes', visibleIds],
     enabled: visibleIds.length > 0,
     staleTime: 1000 * 60 * 10,
     queryFn: async () => {
       const { data } = await supabase
         .from('committee_topics')
         .select('fec_committee_id, primary_cause:primary_cause_id(label, stance)')
         .in('fec_committee_id', visibleIds);
       const map = new Map<string, { label: string; stance: string | null }>();
       (data ?? []).forEach((r: any) => {
         if (r.primary_cause?.label) {
           map.set(r.fec_committee_id, { label: r.primary_cause.label, stance: r.primary_cause.stance });
         }
       });
       return map;
     },
   });
   ```

2. **Pass `causeMap` into `SpenderRowItem`** (same pattern as `raisedMap`).

3. **Render a small badge** in the name block (line ~347, between the name `<p>` and the meta line). Use `Badge` variant `secondary` with `text-[10px]` and color-coded border (`border-emerald-500/40` for `stance=pro` on progressive causes, `border-rose-500/40` for conservative, else default). Keep it subtle so it doesn't dominate the row.

4. **Truncate** with `max-w-[200px] truncate` to avoid wrapping on narrow viewports.

## Out of scope

- No DB changes — the data is already populated.
- No changes to the admin classification flow.
- Other committee lists (Candidates page, CommitteeProfile) — only the Top Spenders row gets the badge in this pass.
