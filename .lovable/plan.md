## Goal

Replace the provider-based confidence rules in `ai-donor-analysis` and `ai-recipient-analysis` with a deterministic confidence score computed from **verified provider citations only** (Perplexity / You.com search results — not model-emitted `parsed.sources`). Also fold in both Codex review fixes from PR #50.

## Background

Today confidence comes from the model (`parsed.confidence`) plus crude provider caps:
- Perplexity → keep model's confidence
- You.com → keep model's confidence
- Gemini → cap at 30
- 0 sources + grounded provider → cap at 20 + insufficient

PR #50 makes this deterministic and provider-agnostic, but its first draft had two bugs flagged by Codex:
1. **P1** — confidence wasn't clamped when `insufficient_information=true`, so a mismatched-entity result could still report 70+ confidence.
2. **P2** — confidence was computed from the merged `sources` (verified citations + unverified `parsed.sources` from the model), which lets the model inflate its own score and bypass the "0 sources → insufficient" guard.

## Changes

### 1. New shared helper: `supabase/functions/_shared/confidence.ts`

```ts
export function getDomainReliability(host: string): number   // 0..1
export function computeDeterministicConfidence(
  verifiedSources: { url: string }[]
): number                                                    // 0..100
```

- `getDomainReliability` — small whitelist returning a 0–1 score:
  - `1.00` — fec.gov, congress.gov, senate.gov, house.gov, supremecourt.gov, sec.gov
  - `0.90` — opensecrets.org, propublica.org, followthemoney.org, ballotpedia.org, votesmart.org
  - `0.80` — reuters.com, apnews.com, nytimes.com, washingtonpost.com, wsj.com, bloomberg.com
  - `0.65` — politico.com, thehill.com, axios.com, npr.org, bbc.com, theguardian.com, cnn.com, foxnews.com
  - `0.40` — anything else
  - Robust to bad/missing URLs (returns 0).
- `computeDeterministicConfidence(verifiedSources)`:
  - `sourceCountScore = min(verifiedSources.length / 6, 1)` (saturates at 6 sources)
  - `avgReliability = mean(getDomainReliability(host) for each source)` (0 if empty)
  - `score = 100 * (0.55 * sourceCountScore + 0.45 * avgReliability)`
  - Floors to integer, clamped 0–100. Returns `0` when input is empty.

Keeping the helper shared (vs PR #50's per-function copies) avoids drift. The two domain whitelists in PR #50 differ only in cosmetic ordering — a single union list covers both.

### 2. `supabase/functions/ai-recipient-analysis/index.ts`

Replace the existing confidence block (~lines 301–311 after the You.com merge) with:

```ts
import { computeDeterministicConfidence } from "../_shared/confidence.ts";

// `grounded` already holds Perplexity/You.com verified citations only.
// Do NOT score from `parsed.sources` (Codex P2).
let confidence = computeDeterministicConfidence(grounded);
let insufficient = Boolean(parsed.insufficient_information);

if (grounded.length === 0) {
  insufficient = true;                  // provider-agnostic (was perplexity-only)
}
if (insufficient) {
  confidence = Math.min(confidence, 20); // Codex P1 — clamp when insufficient
}

const confidence_rationale =
  `Deterministic score from ${grounded.length} verified provider citation(s); ` +
  `weighted 55% source count (saturating at 6) + 45% domain reliability.`;
```

- Drop the `provider === "gemini"` cap (Gemini still returns `grounded.length === 0`, so the new code naturally caps it at 20 via the insufficient branch — strictly stricter than the old 30).
- Keep `provider` in the response so the UI can still show "Sourced via X".
- Replace `String(parsed.confidence_rationale ?? "")` in the response payload with the new deterministic `confidence_rationale`.

### 3. `supabase/functions/ai-donor-analysis/index.ts`

Mirror the same swap on the analogous block (~lines 351–356 after the You.com merge). Same import, same logic, same rationale string. Use the local `grounded` array (verified citations only) — not the merged `sources` that includes `modelSources`.

`sources` (the merged array passed to the UI) stays unchanged so the dialog can still render any extra model-supplied URLs as additional reading; only **scoring** ignores them.

### 4. UI

No changes. `RecipientAIAnalysisDialog` and `DonorAIAnalysisDialog` already render `analysis.confidence`, `analysis.confidence_rationale`, and `analysis.sources` generically.

### 5. Skipped from PR #50

- The duplicated per-file helpers (we use one shared module instead).
- The migration that errored in the PR's preview branch (`candidate_committees_candidate_id_fkey` already exists locally) — it's an unrelated FK migration, not part of the confidence change.

## Validation

- Open `/candidate/M001199` (current page). With Perplexity 401 + You.com active → expect a non-zero deterministic confidence proportional to the number/quality of You.com citations, and `confidence_rationale` describing the formula.
- Force both grounded providers to fail (Gemini-only path) → expect `insufficient_information: true` and `confidence ≤ 20`.
- Inject a fake `parsed.sources` URL via prompt → confirm the score does **not** rise (Codex P2 fix).

## Out of scope

- Changing the prompts or the JSON schema requested from models.
- Persisting historical confidence scores.
- Any DB / RLS / migration work.