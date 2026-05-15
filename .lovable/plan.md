# Why this answer looks empty

The DB row for Brian Mast on that question is:

- `answer_value: 0`
- `confidence: low`
- `evidence_type: inferred`
- `source_type: other`
- `source_description: "Unable to determine position"`
- `source_url`, `source_urls`, `source_titles`, `voting_record_summary`, `public_statement_summary`: all empty

That is a **placeholder row**, not a real position.

## Where it comes from

In `supabase/functions/get-candidate-answers/index.ts`, `researchQuestionPosition` runs a 3-stage pipeline:

1. Perplexity deep research
2. Gemini fallback
3. `inferFromPartyAlignment` (last resort)

Stage 3 calls `google/gemini-2.5-flash` and expects strict JSON (`{score, reasoning}`). When the model returns non-JSON / unparseable output, the code calls `createNeutralAnswer(question.id, 'Unable to determine position')` (lines 856–857, 877–889). That helper writes `answer_value: 0`, `evidence_type: 'inferred'`, `source_type: 'other'`, no URLs and no real explanation — exactly the row you're seeing.

Then `generateAnswersForCandidate` (line 984) immediately persists every answer the pipeline returns, including these placeholders. The UI in `CompactPositionRow` has no way to distinguish "real neutral position" from "we gave up", so it renders it as a normal Moderate/0 answer with `Other Source · Unable to determine position`.

## Plan

Scope: backend research function only. No DB schema, no scoring math, no UI redesign.

1. **Stop persisting "gave up" rows in `get-candidate-answers/index.ts`.**
   - Treat the three failure paths in `inferFromPartyAlignment` (`!response.ok`, unparseable JSON, thrown error) as **skips**, not neutral answers. Return `null` from those branches.
   - In `researchQuestionPosition`, if the party-alignment stage returns `null`, propagate `null` upward.
   - In `generateAnswersForCandidate`, if `researchQuestionPosition` returns `null`, increment `failedCount`, log it, and **do not** call `saveAnswersBatch` for that question. The question will simply have no row, which the UI already handles ("no documented position").

2. **Upgrade the inference model.**
   - Change `inferFromPartyAlignment` from `google/gemini-2.5-flash` to `google/gemini-3-flash-preview` (the project default per AI Gateway guidance). This is the same upgrade we just did for `ai-candidate-explanation` and reduces the JSON-parse failures that trigger the placeholder.

3. **Backfill cleanup (one-shot SQL, optional but recommended).**
   - Delete existing placeholder rows so users stop seeing them on already-researched candidates:
     ```sql
     DELETE FROM candidate_answers
     WHERE evidence_type = 'inferred'
       AND source_type = 'other'
       AND source_description IN ('Unable to determine position', 'Unable to infer position', 'Error inferring position', 'Error during research')
       AND (source_url IS NULL)
       AND coalesce(array_length(source_urls,1),0) = 0;
     ```
   - Run via a migration so it's auditable.

4. **Validate.**
   - Re-run a small batch of questions for Mast (M001199) and confirm: questions with real evidence get rows; questions where every stage fails get **no row** (instead of a placeholder).
   - Spot-check that legitimate "Moderate / 0" positions backed by real sources are unaffected (they have non-empty `source_url(s)` and `evidence_type !== 'inferred'`).

## Out of scope
- Changing how the UI renders genuine neutral positions.
- Removing the party-alignment stage entirely (it's still useful when it succeeds with real reasoning).
- Touching `ai-candidate-explanation`, finance, or share-card code.

Files:
- `supabase/functions/get-candidate-answers/index.ts` (primary)
- new SQL migration for the placeholder cleanup
