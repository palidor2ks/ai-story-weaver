## Review of PR #159 — "Add AI election candidate refresh"

The PR adds AI-assisted ballot discovery to `fetch-upcoming-elections`:
- New helpers `fetchYouElectionResearch` (You.com) and `fetchAIUpcomingElections` (Lovable AI gateway, Gemini 2.5 Flash, with a JSON-schema tool).
- AI rows are merged with FEC + Google Civic in the background `persistAll` path and onboard as `pending_research` candidates.
- Re-discovered elections now `UPDATE` their metadata.
- Cache key bumped `v2` → `v3`; UI copy updated.

Both `LOVABLE_API_KEY` and `YOU_API_KEY` are present, so the feature can actually run.

### What's wrong / weak

1. **Preview branch migration is failing** (blocks the PR). Migration `20251230170055_…_fkey.sql` does an unconditional `ALTER TABLE … ADD CONSTRAINT candidate_committees_candidate_id_fkey …`. The constraint already exists on the preview branch → `SQLSTATE 42710`. This is unrelated to the AI work but is what the Supabase bot is flagging.
2. **`source_url` and `confidence` are dead fields on `ElectionPayload`.** They're set on AI rows but `persistAll` never writes them to the `elections` insert/update, so nothing surfaces in the DB or UI.
3. **Hallucination risk.** The exact failure mode the user hit before ("Jane Q. Challenger" placeholder) will reappear if Gemini invents a candidate — they'll be inserted as real `candidates` rows with `answers_source='pending_research'` and `confidence='low'` and rendered as "Researching…". The PR filters out `confidence === 'low'` candidates but accepts `medium`/`high` from the model, which is still a hallucination surface. There's also no `source_url`/`source_ref` requirement at insert time, so untraceable candidates can land.
4. **`row.state === null` check is dead code** — JSON.parse from a tool call returns `undefined` for missing keys, never `null`. So national races still get the user's state stamped on them.
5. **No per-address rate limiting on the AI call.** Every cache miss triggers a You.com research call + a Gemini tool call. Fine in dev, but on warm-up after `force: true` (Refresh button) it's an unbounded fan-out.
6. **`MAX_RESEARCH_PER_RUN = 5` cap** is shared across FEC + Civic + AI now. AI rows can starve real candidates of background research slots since they're appended last but loops insert in order.
7. Minor: tool schema doesn't list `state` as required, but the prompt asks for it; some AI rows will arrive without state and fall back to caller's state — acceptable.

## Plan

### Step 1 — Unblock the migration

Edit `supabase/migrations/20251230170055_…_fkey.sql` to be idempotent:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidate_committees_candidate_id_fkey'
      AND conrelid = 'public.candidate_committees'::regclass
  ) THEN
    ALTER TABLE public.candidate_committees
      ADD CONSTRAINT candidate_committees_candidate_id_fkey
      FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
      ON DELETE SET NULL;
  END IF;
END $$;
```

### Step 2 — Persist `source_url` / `confidence` on elections

`elections` already has these columns in the runtime schema (used by the AI rows builder). Update `persistAll`'s insert and the new metadata-refresh `update` to include `source_url: row.source_url ?? null` and `confidence: row.confidence ?? null`. If the columns don't exist yet, add a small migration:

```sql
ALTER TABLE public.elections
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS confidence text;
```

### Step 3 — Tighten AI candidate guardrails

In `fetchAIUpcomingElections`:
- Require a non-empty `source_url` on every accepted row **and** every accepted candidate (drop the candidate if missing). This is the same "no source = no insert" rule used elsewhere in the research pipeline (see `mem://technical/smart-truncate-and-evidence-policy`).
- Only accept `confidence === 'high'` for *new* candidates not yet in `candidates`; allow `medium` only when collapsing onto an existing record via name/state/office.
- Cap to `MAX_AI_ELECTIONS` (8) elections **and** `MAX_AI_CANDIDATES_PER_ELECTION = 6` to bound fan-out.

### Step 4 — Plumb confidence through to the UI

Surface AI provenance so users (and us, when debugging the next "Jane Q." moment) can tell where a name came from:
- Extend `UpcomingCandidate` with `source: string` and `source_url: string | null`, read from `election_candidates.source` + `candidates`/`election_candidates.source_ref`.
- In `UpcomingElectionsCard` show a small `AI-sourced` badge next to AI candidates with the source_url as a tooltip link. No layout change beyond the existing party/incumbent chips.

### Step 5 — Background-research budget

Split `MAX_RESEARCH_PER_RUN` into two buckets: `MAX_RESEARCH_FEC_CIVIC = 5` and `MAX_RESEARCH_AI = 3`, so AI-onboarded candidates don't crowd out real ones (or vice-versa).

### Step 6 — Verify

- Re-run the Piscataway / NJ-06 + Newark / NJ-10 city-normalization edge function tests from the prior turn with `force: true` to confirm AI rows appear, are filtered by source, and city normalization still passes through.
- Confirm `supabase db push` runs clean against the preview branch.
- Spot-check the UI for the new AI badge and that no source-less rows render.

### Out of scope

- We are **not** retroactively scrubbing existing AI-sourced candidates (none exist yet).
- We are **not** changing the FEC/Civic ingestion paths.
- We are **not** wiring AI provenance into the candidate profile page; only the upcoming-elections card.
