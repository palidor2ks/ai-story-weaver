# Implement PR #132 — Prefer specific committee causes over generic partisan buckets

## Why

Today, when a committee is classified as generic `Progressive (general)` / `Conservative (general)` / `Libertarian (general)` as primary, with a specific issue cause (e.g. `Pro-Immigration`) only in `secondary_cause_ids`, the share-card UI displays the generic bucket. PR #132 promotes the specific cause to primary so users see the meaningful label.

## Changes

### 1. New shared helper — `src/lib/committeeCauseDisplay.ts`
Exports `isGenericCause()` and `choosePrimaryCauseLabel(primary, secondaries[])`. Generic = id in `{progressive, conservative, libertarian}` or label matching `/\(general\)/i`. When primary is generic and any non-generic secondary exists, return that secondary's label; otherwise fall through to primary then first secondary.

### 2. `src/hooks/useCandidateShareCardData.ts` (L155-168)
Apply the diff as-is: select `id` on primary cause, also fetch `secondary_cause_ids`, then resolve secondary cause labels via a second `committee_causes` lookup and use `choosePrimaryCauseLabel` to populate the map.

### 3. `src/components/ShareProfileButton.tsx` (L151-171) — diverges from PR
The PR's base did not include the `stance` field that's now in the query/map value. **Fix:** keep selecting `stance` on `primary_cause`, keep the map value shape `{ label, stance }`, but pick `label` via `choosePrimaryCauseLabel`. Stance stays from the primary cause row (semantically the underlying ideological stance does not change when we surface a more specific label). Add the same secondary-cause lookup as in the hook.

```ts
.select('fec_committee_id, secondary_cause_ids, primary_cause:primary_cause_id(id, label, stance)')
// ... fetch secondary causes by id
const label = choosePrimaryCauseLabel(r.primary_cause, secondaries);
if (label) map.set(r.fec_committee_id, { label, stance: r.primary_cause?.stance ?? null });
```

### 4. `supabase/functions/classify-committee-topic/index.ts`
Apply prompt + system-message wording changes verbatim (instruct model to prefer specific over generic when evidence supports it).

### 5. New migration — rename to project convention
PR's filename `20260530000000_prefer_specific_committee_primary_causes.sql` is fine as a timestamp but our convention uses a uuid suffix. Create as `supabase/migrations/<new-timestamp>_prefer_specific_committee_primary_causes.sql` with the SQL from the PR unchanged: for every `committee_topics` row whose `primary_cause_id` is `progressive`/`conservative`/`libertarian` and which has a non-generic secondary, promote the first non-generic secondary to primary and demote the old generic primary into secondary_cause_ids (deduped, ordering preserved).

## Out of scope

- No change to `committee_causes` table.
- No re-classification run; this is a one-shot re-ordering of already-classified rows plus a forward-going prompt nudge.

## Verification

1. After migration, spot-check `committee_topics` rows that previously had `primary_cause_id='progressive'` and a specific secondary — primary should now be the specific cause, `progressive` should appear in `secondary_cause_ids`.
2. Open a candidate share card whose top spender was affected — chip should now read e.g. `Pro-Immigration` instead of `Progressive (general)`.
3. ShareProfileButton popover still shows correct stance color (driven by `stance`).
4. `npx tsc --noEmit` clean.
