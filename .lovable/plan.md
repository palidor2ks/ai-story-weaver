# Fix "Failed to load AI analysis" error

## Root cause

Edge function logs show two compounding issues:

1. **Cache writes never persist.** Every call to `writeCache` fails with:
   `there is no unique or exclusion constraint matching the ON CONFLICT specification`

   The `ai_analysis_cache` table has a unique **expression** index (`COALESCE(cycle,'')`, `COALESCE(user_id::text,'')`, …) instead of a plain unique constraint, so Supabase's `.upsert({ onConflict: "kind,subject_id,cycle,user_id,input_fingerprint" })` cannot match it. The first request returns successfully but the result is never cached, so the next view re-hits the AI gateway.

2. **Gateway rate-limits (HTTP 429)** as a direct consequence — every profile view re-generates the same analysis. The function throws, and `AIExplanation.tsx` shows a destructive red toast.

## Fix

### 1. Database migration

Replace the expression unique index with a real unique constraint that matches the `onConflict` column list, treating NULLs as equal so a single row per `(kind, subject_id, cycle, user_id, input_fingerprint)` is enforced even when optional columns are null:

```sql
drop index if exists public.ai_analysis_cache_key_idx;

alter table public.ai_analysis_cache
  add constraint ai_analysis_cache_key_uniq
  unique nulls not distinct (kind, subject_id, cycle, user_id, input_fingerprint);
```

No code change needed in `_shared/ai-cache.ts` — the existing `onConflict` string will then match.

### 2. Soften the user-facing error in `src/components/AIExplanation.tsx`

- Catch 429 / rate-limit responses specifically and show a non-destructive inline message ("AI analysis is busy — try again in a moment") instead of the red toast.
- Keep the toast for genuine errors but use `variant: 'default'` and a friendlier copy.
- Do not auto-retry from the client (would amplify rate limits); the refresh button already exists.

## Out of scope

- Personalized rep score, party scores, scoring logic — unchanged.
- AI prompt, model, or cache TTL — unchanged.

## Verification

- After migration: trigger one profile view → check edge logs show no `ai-cache write error` and a row exists in `ai_analysis_cache`. Reload the profile → second view should return `cached: true` and not call the gateway.
- 429 path: temporarily simulate by forcing refresh repeatedly → confirm UI shows the soft inline message, not the red error toast.
