## Goal

Apply the changes from the linked PR to this project, and resolve the runtime error Codex flagged: the new `toOneSentence` helper crashes if the AI returns non-string array items (`null`, numbers, etc.), making the analysis dialog fail to render.

## Changes

### 1. `src/components/DonorAIAnalysisDialog.tsx`
- Import `DialogClose` and `X` icon.
- Add `toOneSentence(items)` helper that:
  - Coerces every entry to a string (`String(item)`),
  - Filters out `null`/`undefined`/non-string-coercible junk,
  - Trims, strips trailing period, joins with `; `, ends with `.`.
- Make `DialogContent` hide the default close (`[&>button:last-child]:hidden`) and make `DialogHeader` sticky (`sticky top-0 z-10 bg-background pb-2 border-b`).
- Replace the lone Regenerate button with a header action group: Regenerate + custom `DialogClose` X button (always visible while scrolling). Show a standalone X close when no analysis loaded yet.
- Replace bullet lists for `goals`, `notable_recipients`, `key_people`, `controversies`, `motivation_hypotheses` with single-sentence `<p><strong>Label:</strong> …</p>` blocks using `toOneSentence`.
- Prefix each Sources list item with `[n]` to map citations.

### 2. `src/components/RecipientAIAnalysisDialog.tsx`
- Mirror the exact same set of changes (imports, sticky header, close button group, `toOneSentence` with the same string-safety guard, concise sections, `[n]` prefix on sources).

### 3. `supabase/functions/ai-donor-analysis/index.ts`
- Tighten the prompt: "Produce a concise, non-redundant structured analysis…", note `notable_recipients` shouldn't repeat goals/positions, require `public_context_claims` to end with `[n]` citation indexes mapping to the citation list.
- In Perplexity citation handling, drop the `${host} [${i+1}]` title format and instead emit `{ title: host, url, citation_index: i + 1 }` so the UI's `[n]` prefix is the single source of truth for indexing.

### 4. Migrations (idempotency / 42P13 fixes)
- `supabase/migrations/20251230170055_*.sql`: wrap the `candidate_committees_candidate_id_fkey` FK add in a `DO $$ … IF NOT EXISTS … $$;` block so re-runs don't fail.
- `supabase/migrations/20251231030626_*.sql` and `supabase/migrations/20251231140008_*.sql`: prepend `DROP FUNCTION IF EXISTS public.get_contribution_totals(text, text);` and `…get_contribution_totals_by_committee(text, text);` before each `CREATE OR REPLACE FUNCTION`, since the return-type change requires drop+recreate (Postgres 42P13).

These migration files are historical; editing them is safe locally because they have already run on this project's DB. They only matter for fresh re-applies (e.g. Supabase preview branches), which is exactly what the PR is fixing.

## Codex error being resolved

Codex P1: `toOneSentence` calls `.trim()` on items that may be `null`/numbers/etc. since the edge function only does `Array.isArray(...)`. Fix: coerce to string and filter empties before trim:

```ts
const toOneSentence = (items: unknown[]) =>
  items
    .map((item) => (item == null ? '' : String(item)).trim().replace(/\.$/, ''))
    .filter(Boolean)
    .join('; ') + '.';
```

This is the only deviation from the PR — it hardens the helper so the dialog never throws on malformed AI output.

## Validation

- Confirm both dialogs render without errors when analysis arrays contain mixed/empty values.
- Confirm sticky header keeps Regenerate + X visible while scrolling long analyses.
- Confirm Sources list shows `[1] host`, `[2] host`, … matching `[n]` references in the body.
- Edge function deploys automatically; spot-check the prompt output is more concise.
