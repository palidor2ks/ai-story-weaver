
## Problem

When you click "Regenerate Topic" for a civic official like Bob Smith, the edge function `get-candidate-answers` can't find them because:

1. The frontend (`CandidateAnswersDialog`) only passes `candidateName` — it does NOT pass `candidateParty`, `candidateOffice`, or `candidateState`.
2. The edge function falls through to DB lookup, checking `candidates` then `static_officials` tables — but civic officials live in `candidate_overrides`.
3. Since the official isn't found, the function returns early with 0 answers generated.

## Fix (two changes)

### 1. Frontend: Pass full candidate info to the edge function

In `CandidateAnswersDialog.tsx`, update `handleRegenerateTopic` (and `handleRegenerateQuestion`) to pass the candidate's party, office, and state alongside the name. This requires the dialog to receive or fetch these fields.

The simplest approach: update `CandidateAnswersDialogProps` to accept optional `candidateParty`, `candidateOffice`, and `candidateState` props, and pass them through to the edge function call. Then update callers to provide these values.

### 2. Edge function: Add `candidate_overrides` as a fallback lookup

In `get-candidate-answers/index.ts` (around line 1216-1219), after checking `candidates` and `static_officials`, add a third fallback that checks `candidate_overrides`:

```typescript
if (!officialInfo) {
  const { data: override } = await supabase
    .from('candidate_overrides')
    .select('candidate_id, name, party, office, state')
    .eq('candidate_id', candidateId)
    .maybeSingle();
  if (override) {
    officialInfo = { id: override.candidate_id, name: override.name, party: override.party, office: override.office, state: override.state };
  }
}
```

This is the more robust fix since it handles all callers (batch, single question, topic regeneration) without requiring every frontend caller to pass extra fields.

## Recommendation

Implement change #2 only (edge function fallback) — it's a single-file change that fixes the root cause for all callers.
