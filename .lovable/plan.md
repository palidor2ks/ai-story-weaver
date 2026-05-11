## Fix: Trump card link broken on Feed

**Root cause:** `fetchFederalExecutiveFromGitHub` in `supabase/functions/fetch-civic-officials/index.ts` emits Trump with his bioguide id `T000338`, but the `candidates` table stores him under FEC id `P80001571`. So `/candidate/T000338` finds no match. JD Vance happens to share his bioguide id with the candidates row (`V000137`), which is why his card works.

### Change

In `supabase/functions/fetch-civic-officials/index.ts`, after both calls to `fetchFederalExecutiveFromGitHub()` (around lines 1009 and 1033), remap the synthetic ids to the existing DB ids:

```ts
// Re-key federal executives to existing candidates rows so the Feed link
// matches the canonical id (e.g. Trump -> P80001571 instead of T000338).
const execNames = federalExecutive.map(e => e.name);
if (execNames.length) {
  const { data: dbExecs } = await sb
    .from('candidates')
    .select('id, name, office')
    .in('name', execNames)
    .in('office', ['President', 'Vice President']);
  const norm = (s: string) =>
    (s || '').toLowerCase().replace(/\b[a-z]\.\s*/g, '').replace(/\s+/g, ' ').trim();
  const byKey = new Map<string, string>();
  for (const r of dbExecs || []) {
    byKey.set(`${norm(r.name)}::${(r.office || '').toLowerCase()}`, r.id);
  }
  for (const e of federalExecutive) {
    const id = byKey.get(`${norm(e.name)}::${e.office.toLowerCase()}`);
    if (id) e.id = id;
  }
}
```

This avoids creating a duplicate Trump record (respects the no-duplicates rule) and keeps Vance unchanged.

### Verification

1. Hard reload `/feed`, click Trump → lands on `/candidate/P80001571` and shows the existing Trump profile (R6.09, Republican).
2. Click JD Vance → still works (`/candidate/V000137`).
3. No new rows created in `candidates` or `candidate_overrides`.