## Problem

State legislators and executives (e.g., Kevin Egan, Mikie Sherrill as Governor) show no AI comparison summary on the user profile page. The `RepresentativeComparisonCard` requires `repAnswers.length > 0` to trigger AI summary generation, but all civic officials currently have **0 answers** in `candidate_answers`.

The `populate-candidate-answers` / `batch-populate-answers` flow only runs for federal candidates. Civic officials fetched via Open States are never queued for AI answer population.

## Root Cause

The answer population pipeline doesn't include civic officials. Without answers, the comparison card correctly skips AI generation (there's nothing to compare).

## Proposed Fix

### 1. Add civic officials to the batch answer population pipeline

Modify `batch-populate-answers` (or create a trigger in the civic officials fetch flow) to automatically queue newly fetched civic officials for AI answer population. When a civic official is added to `candidate_overrides`, it should be eligible for the same Perplexity-based research that federal candidates get.

### 2. Add a manual "Populate Answers" button in the Civic Officials admin panel

Allow admins to trigger answer population for specific civic officials from the admin panel, similar to how it works for federal candidates.

### 3. (Optional) Show a "No data yet" message instead of hiding the summary

Currently, if there are no rep answers, the comparison section is silently hidden. We could show a message like "AI analysis pending — answers are being researched" so users know it's coming.

## Technical Details

- The `populate-candidate-answers` edge function already works with any `candidate_id` — it queries questions and calls Perplexity to research positions. It should work for state officials without modification.
- The `batch-populate-answers` function queries candidates to process — this query needs to include civic officials (those with `openstates_` or manually added IDs).
- The civic officials panel (`CivicOfficialsPanel.tsx`) needs a "Populate Answers" action button per official.
