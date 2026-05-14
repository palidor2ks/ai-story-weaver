## Goal

Replace the static donor-card summary in the AI Analysis dialog with a real AI-powered analysis served by a new `ai-donor-analysis` edge function, including loading/error states and structured rendering.

## 1. New edge function: `supabase/functions/ai-donor-analysis/index.ts`

- Auth: validate JWT via `supabase.auth.getClaims()`; return 401 if missing/invalid.
- Input (validated with Zod): `{ donor_id: string, donor_name: string, donor_type: string, cycle?: string }`.
- Gather DB signals using service-role client:
  - From `donors`: total `amount`, `transaction_count`, name variations matching `display_name`/aliases, types.
  - From `contributions` joined to `candidate_committees` → `candidates`: aggregate party breakdown (Dem/Rep/Ind/Other totals, top 5 recipient candidates with party + amount), cycle breakdown, and committee types (PAC/Party/Org).
  - From `donor_aliases`: canonical match if any.
- Build a prompt that:
  - Provides finance signals as structured JSON context.
  - Asks model to incorporate broader public context (news, public statements, social media, official bios) about this donor.
  - Requires explicit "insufficient information" language when signals are thin and forbids fabrication.
  - Requires source links (`{ title, url }[]`) when external context is used.
- Call Lovable AI Gateway (`google/gemini-2.5-flash` via `LOVABLE_API_KEY`) with `response_format: json_object` and a strict JSON schema:
  ```ts
  {
    summary: string,            // 2-3 sentence overview
    analysis: string,           // longer narrative
    party_support: { party: string, amount: number, share: number }[],
    causes: string[],           // inferred issue priorities
    motivation_hypotheses: string[],
    insufficient_information: boolean,
    sources: { title: string, url: string }[]
  }
  ```
- Handle 429/402 from gateway with friendly errors. Always return CORS headers.

## 2. Frontend: `src/components/DonorCard.tsx`

- Add local state: `analysis`, `isLoading`, `error`, `hasFetched`.
- On Dialog `onOpenChange(true)` and not yet fetched, invoke `supabase.functions.invoke('ai-donor-analysis', { body: { donor_id: id, donor_name: name, donor_type: type, cycle } })`.
- Replace the static `analysisSummary` rendering with:
  - Loading: spinner + "Generating analysis..." (reuse `Loader2` pattern from `AIExplanation.tsx`).
  - Error: inline error message + Retry button.
  - Success: render
    - **Summary** paragraph
    - **Party support** bars/list (party, amount, share %)
    - **Likely causes** badge list
    - **Motivation hypotheses** bullet list
    - **Deep analysis** prose (collapsible)
    - **Sources** link list with `ExternalLink` icon
    - If `insufficient_information`, render an amber notice banner instead of fabricated detail.
- Keep "Open full donor profile" CTA + disclaimer footer.
- Pass current `cycle` from `Donors` page (optional; falls back to all cycles).

## 3. Donors page wiring

- `src/pages/Donors.tsx` (or wherever `DonorCard` is rendered): pass current `cycle` filter prop to `DonorCard` so analysis is cycle-scoped.

## Technical notes

- No DB schema changes required.
- `LOVABLE_API_KEY` already configured.
- `supabase/config.toml`: edge function uses default JWT verification; explicit `verify_jwt = true` block added for clarity.
- Pattern mirrors existing `ai-candidate-explanation` flow used by `AIExplanation.tsx`.

## Files

- new: `supabase/functions/ai-donor-analysis/index.ts`
- edited: `supabase/config.toml` (register function)
- edited: `src/components/DonorCard.tsx`
- edited: `src/pages/Donors.tsx` (pass cycle prop)

## Open question

Should the analysis be cached (e.g., per `donor_id + cycle` for 24h in a `donor_ai_analysis` table) to control cost, or always fresh on dialog open? Default in this plan: always fresh, no cache.