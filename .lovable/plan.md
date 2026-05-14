## Goal

Make the AI analysis on Donor cards (and add the equivalent on Recipient cards) actually search the web for the entity by name + FEC ID, then return a real, cited analysis of their political positions and what they're trying to achieve with their donations / spending.

## Why the current version is weak

The `ai-donor-analysis` edge function only feeds Gemini our internal finance signals plus a "use background knowledge" instruction. It never hits the web. When filings are sparse (e.g. America PAC with no recipients in our DB), the model has nothing to anchor on and either refuses or hallucinates. There is no real-time grounding and no real citations.

## Fix: ground the analysis in live web search

Switch the AI call to **Perplexity `sonar-reasoning-pro`** (already documented in this project) so every analysis is built from a fresh web search over reputable sources (FEC.gov, OpenSecrets, ProPublica, major news). The Lovable AI Gateway models don't do live search; Perplexity does, and returns a `citations[]` array we can show directly.

The edge function will:

1. Build a search query that combines: donor display name, FEC committee ID (when present), donor type, and the top recipients we already have on file (as disambiguators).
2. Call Perplexity with `search_domain_filter` biased toward `fec.gov`, `opensecrets.org`, `propublica.org`, `followthemoney.org`, plus major news.
3. Use Perplexity's `response_format: json_schema` to extract: `summary`, `positions` (issue stances), `goals` (what they're trying to achieve with donations/spending), `key_people`, `notable_recipients`, `controversies`, `confidence`, `confidence_rationale`, `insufficient_information`.
4. Merge Perplexity's `citations[]` into the existing `sources[]` field so the dialog's Sources section is populated automatically.
5. Keep the deterministic `data_coverage` and our local `finance_context` (totals, party split, top recipients) as a separate, server-computed block — not something the model invents.
6. Hard rule: if Perplexity returns zero citations OR the search results clearly describe a different entity than our finance signals, set `insufficient_information=true` and cap `confidence` at 20. This kills the America-PAC-style hallucinations.

## Recipient card analysis

Add a parallel `ai-recipient-analysis` edge function and a `RecipientAIAnalysisDialog` component that does the same thing for the receiving side:

- For **candidates**: search by candidate name + FEC candidate ID + office/state. Return positions, policy priorities, top donor categories, and what their fundraising pattern suggests about their coalition.
- For **committees** (PACs, party committees): search by committee name + FEC committee ID. Return mission, affiliated candidates, ideological lean, and spending strategy.

The dialog is a thin wrapper over the same UI used for donors (shared layout: confidence bar, data coverage chip, summary, positions, goals, finance context, sources). I'll extract the shared presentation into a single `EntityAIAnalysisDialog` so donor and recipient stay visually identical and easy to maintain.

Mount points:
- Donor: already on `DonorCard` and `DonorProfile` — swap to the shared dialog.
- Recipient: add a "✨ AI analysis" button to `CandidateCard` and to the candidate/committee profile pages, opening the new dialog.

## Secrets

Requires `PERPLEXITY_API_KEY`. I'll request it via the secrets flow before deploying. `LOVABLE_API_KEY` stays as a fallback for the structured-extraction step if Perplexity ever fails.

## Files

- edit `supabase/functions/ai-donor-analysis/index.ts` — replace Gemini call with Perplexity grounded search + JSON schema; keep deterministic finance block.
- new `supabase/functions/ai-recipient-analysis/index.ts` — same pattern, candidate/committee inputs.
- new `src/components/EntityAIAnalysisDialog.tsx` — shared presentation (extracted from `DonorAIAnalysisDialog`).
- edit `src/components/DonorAIAnalysisDialog.tsx` — becomes a thin wrapper.
- new `src/components/RecipientAIAnalysisDialog.tsx` — wrapper for candidate/committee.
- edit `src/components/CandidateCard.tsx` and the candidate/committee profile pages — add the trigger button.

## Open questions before I build

1. By "Recipient card" do you mean **candidate cards**, **committee cards**, or both? (I'm planning both unless you say otherwise.)
2. OK to add `PERPLEXITY_API_KEY` as a project secret? Without it the web-search grounding can't work.
