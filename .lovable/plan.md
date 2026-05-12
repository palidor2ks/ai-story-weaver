## Why this happens

The question `defense-q2` (and ~hundreds of others) has **two options that both store value `0`**:

1. `"Not important to me"` (value 0)
2. `"Neutral—reduce where appropriate, retain critical bases."` (value 0)

The AI inferred Houlahan as **neutral** with a score of `0` (Center → "C" badge). But `CandidateAnswersDialog.getOptionTextForScore` (`src/components/admin/CandidateAnswersDialog.tsx:46-54`) does `options.find(o => o.value === value)` and returns the **first** match — which is "Not important to me". That's why the position label is wrong even though the underlying score and AI explanation are correct.

The AI explanation itself even quotes the right option: *"...suggests a 'Neutral—reduce where appropriate, retain critical bases' stance."*

## Plan

Frontend-only fix in `src/components/admin/CandidateAnswersDialog.tsx`:

1. Change `getOptionTextForScore` to prefer the substantive neutral option over the generic "Not important to me" sentinel when both share value `0`. Concretely: when multiple options match the value, skip ones whose text matches `/^not important to me$/i` and return the next match. If only "Not important to me" exists at that value, keep current behavior.

2. No DB changes, no scoring logic changes, no edge-function changes. The score (`0` → "C") and AI explanation remain identical; only the human-readable Position label updates from "Not important to me" → "Neutral—reduce where appropriate, retain critical bases."

## Out of scope

- Restructuring the `question_options` schema to give "Not important to me" a separate sentinel value (e.g. `null` or a dedicated flag). That's a larger data migration affecting quiz scoring, party answers, and import flows — happy to plan it as a follow-up if you want.
- Changing how the AI picks/labels positions in the edge functions.

## Verification

Reopen the Houlahan answers dialog → defense-q2 should now read `Position: Neutral—reduce where appropriate, retain critical bases.` Spot-check one other duplicate-zero question (e.g. `civil-rights-q1`, `economy-q1`) for an inferred score of 0 to confirm the label is the substantive neutral, not "Not important to me".