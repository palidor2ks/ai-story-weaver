## Goal

Persist every AI analysis the first time it's generated, then serve cached results on subsequent visits. Replace the "click to generate" flow with auto-load from cache + a Refresh button for manual regeneration.

## In scope (4 AI surfaces)

| Surface | Component | Edge fn | Cache key | Scope |
|---|---|---|---|---|
| Candidate AI Stance Analysis | `AIExplanation` | `ai-candidate-explanation` | candidate_id + user_id (+ user-scores fingerprint) | per-user |
| Donor AI Analysis | `DonorAIAnalysisDialog` | `ai-donor-analysis` | donor_id + cycle | global |
| Recipient AI Analysis | `RecipientAIAnalysisDialog` | `ai-recipient-analysis` | committee_id + cycle | global |
| Bill AI Analysis | `BillAIAnalysisDialog` | `ai-bill-analysis` | bill_id | global |

## Schema (single new table)

```sql
create table public.ai_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                -- 'candidate' | 'donor' | 'recipient' | 'bill'
  subject_id text not null,          -- candidate_id / donor_id / committee_id / bill_id
  cycle text,                        -- nullable; used by donor + recipient
  user_id uuid references auth.users(id) on delete cascade,  -- null for global kinds
  input_fingerprint text,            -- hash of user-scores blob for candidate; null otherwise
  payload jsonb not null,            -- raw analysis JSON returned by the edge fn
  model text,                        -- e.g. 'google/gemini-3-flash-preview'
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (kind, subject_id, cycle, user_id, input_fingerprint)
);
```

RLS:
- Global rows (`user_id is null`) — `SELECT` to `public`.
- Per-user rows — `SELECT/INSERT/UPDATE/DELETE` only when `auth.uid() = user_id`.
- Service role full access (writes happen from edge functions).

## Edge function changes (shared cache-read + cache-write helper)

Each of the four edge functions gets the same wrapper:

1. Compute cache key (kind/subject/cycle/user_id/input_fingerprint).
2. Look up `ai_analysis_cache`. If a row exists AND the request did not pass `force_refresh: true`, return `payload`.
3. Otherwise call the model, upsert into `ai_analysis_cache`, then return.

Edge fn signature additions: optional `force_refresh: boolean` in the request body. For per-user kinds, the function reads `auth.uid()` from the verified JWT (already passed by `supabase.functions.invoke` when the user is signed in); anonymous users skip cache and behave as today.

`input_fingerprint` (candidate kind only): SHA-256 of canonicalized `userTopicScores` JSON. Different score profile → different cache row; same profile → reuse.

## Frontend changes

In each of `AIExplanation`, `DonorAIAnalysisDialog`, `RecipientAIAnalysisDialog`, `BillAIAnalysisDialog`:

- Replace the "click to generate" gate with an auto-fetch on mount/open (the cache lookup is cheap; first-render shows skeleton while the edge fn returns a cached payload).
- Add a small "Refresh" icon button (RefreshCw) in the header that calls the same edge fn with `force_refresh: true` and overwrites the local state.
- Show last-generated timestamp ("Updated 5/12/2026") under the title, sourced from `ai_analysis_cache.updated_at` returned alongside the payload.
- Keep the existing error / retry handling.

For `AIExplanation` specifically: today it auto-shows the "Click below to generate…" placeholder. After the change, that placeholder is gone — content loads automatically and the Refresh button regenerates with the current `userTopicScores`.

## Anonymous users

- Global kinds (donor/recipient/bill): full cache benefit for everyone.
- Per-user candidate analysis: anonymous visitors still get the generic (no-user-scores) variant, cached as a single global row with `user_id = null` and `input_fingerprint = null`.

## Out of scope

- Background pre-warming, cache TTL/expiration (refresh is manual).
- Caching admin-only tools (`generate-ai-bill-summaries` already persists into `bills.summary` and is unchanged).
- UI changes beyond the 4 components above.

## Verification

1. Open Trump's profile → AI Stance Analysis loads from cache on second visit, no spinner.
2. Click Refresh → spinner, new content, `updated_at` advances.
3. Sign out → generic analysis cached/served from a separate row.
4. Open a donor / committee / bill dialog twice → second open is instant; Refresh regenerates.
