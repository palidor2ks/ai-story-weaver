## Goal

Replace the "Dig Deeper AI Analysis" button on each sponsored/cosponsored bill (CandidateProfile sponsored legislation list) — which currently opens perplexity.ai in a new tab — with an in-app dialog that fetches AI analysis and displays it inline, matching the look/feel of the donor analysis box (`DonorAIAnalysisDialog` / `RecipientAIAnalysisDialog`).

## Changes

### 1. New edge function: `supabase/functions/ai-bill-analysis/index.ts`
Modeled on `ai-recipient-analysis`. Accepts:
```
{ bill_id, bill_type, bill_number, bill_name, congress, topic, status, candidate_name, candidate_role, is_sponsor }
```
Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a web-grounded prompt asking for:
- `summary` — what the bill does in plain English
- `key_provisions[]` — main provisions
- `positions[]` — `{ topic, stance }` how it intersects major policy areas
- `candidate_role_explanation` — why this candidate likely sponsored/cosponsored, based on their record
- `controversies[]`, `supporters[]`, `opponents[]`
- `sources[]` — `{ title, url }` citations
- `confidence` (0–100), `confidence_rationale`, `insufficient_information` flag

Returns structured JSON. Uses `Output.object` (AI SDK) for schema enforcement. CORS + error normalization mirror existing functions.

Register in `supabase/config.toml` with `verify_jwt = false` (matching sibling AI functions — verify pattern first).

### 2. New component: `src/components/BillAIAnalysisDialog.tsx`
Modeled directly on `RecipientAIAnalysisDialog`. Props:
```
{ billId, billType, billNumber, billName, congress, topic, status, candidateName, candidateRole, isSponsor, trigger }
```
- Trigger renders the existing "Dig Deeper AI Analysis" button.
- On open, invokes `ai-bill-analysis` edge function, shows loading spinner, then renders sections (summary, key provisions, positions, candidate role, controversies, supporters/opponents, sources).
- Confidence + data-coverage chip, regenerate button, sticky header — same patterns as the donor/recipient dialog.

### 3. `src/pages/CandidateProfile.tsx` (lines ~1114–1130)
Replace the `<Button asChild>` wrapping a perplexity `<a>` with:
```tsx
<BillAIAnalysisDialog
  billId={bill.bill_id}
  billType={bill.bill_type}
  billNumber={bill.bill_number}
  billName={bill.bill_name}
  congress={bill.congress}
  topic={bill.topic}
  status={bill.status}
  candidateName={candidate.name}
  candidateRole={candidate.office /* or similar */}
  isSponsor={bill.is_sponsor}
  trigger={
    <Button size="sm" variant="outline" className="h-7 text-xs">
      <Sparkles className="w-3 h-3 mr-1" />
      Dig Deeper AI Analysis
    </Button>
  }
/>
```
Add the import. No other UI changes.

## Out of scope
- No DB schema changes (no caching layer for bill analyses in this pass — can be added later if usage warrants, mirroring donor cache patterns).
- No change to the comparable Perplexity link in `RepComparisonSummary` (different surface; only the bill-list button per the user's request).
- No changes to other Perplexity integrations.

## Technical notes
- Edge function uses `LOVABLE_API_KEY` (auto-provisioned) via `createLovableAiGatewayProvider`; no new secrets.
- Errors (429/402/network) surfaced inline in the dialog, same as `RecipientAIAnalysisDialog`.
- Sources rendered as numbered, clickable list with `ExternalLink` icons.
