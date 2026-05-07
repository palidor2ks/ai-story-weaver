
## Problem

The CandidateAnswersDialog filters topics by scope based on the candidate's office. Since Mikie Sherrill is now "Governor" (a local office), `isLocalOfficial('Governor')` returns `true`, and the dialog only shows **local** topics (5 topics). Her 240 federal-topic answers are hidden from the admin answer management view.

Per project rules: "12 federal + 5 local topics (17 total). Local topics only for governor+below." This means local topics are **added** for governor+below — they should see all 17 topics, not just 5.

## Fix

In `src/components/admin/CandidateAnswersDialog.tsx` (line ~117-122): change the scope filter logic so that:
- **Federal officials** (Senator, Representative): show only `scope = 'all'` topics (12 federal)  
- **Local officials** (Governor and below): show **both** `scope = 'all'` AND `scope = 'local'` topics (all 17)

Change:
```ts
const scope = isLocalOfficial(office) ? 'local' : 'all';
// .eq('scope', scope)
```
To:
```ts
if (isLocalOfficial(office)) {
  // Governor+below: show ALL topics (federal + local)
  // No scope filter needed — fetch all
} else {
  // Federal: only federal topics
  query = query.eq('scope', 'all');
}
```

This is a ~5-line change in one file.
