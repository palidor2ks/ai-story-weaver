## Problem

On the candidate profile (e.g. Michele Lombardi), the "AI Stance Analysis" card renders raw JSON text — both the summary line and the "Deep Analysis" panel show `{ "summary": "...", "deepAnalysis": "...", ... }` instead of the parsed fields.

## Root Cause

`supabase/functions/ai-candidate-explanation/index.ts` calls the AI with `response_format: { type: 'json_object' }` and then does a plain `JSON.parse(content)`. When the model returns the JSON wrapped in a markdown code fence (```` ```json ... ``` ````) or with leading/trailing prose, `JSON.parse` throws and the fallback branch runs:

```ts
analysis = {
  summary: content.substring(0, 200),   // raw JSON, truncated
  deepAnalysis: content,                // full raw JSON blob
  sources: [],
};
```

That's exactly what the screenshot shows — `summary` is the first ~200 chars of the raw JSON string, and `deepAnalysis` is the whole blob. `personalizedComparison` is missing, which is why the agree/differ panel never renders.

## Fix Plan (single file: `supabase/functions/ai-candidate-explanation/index.ts`)

1. Add a small `extractJson(content)` helper that:
   - Trims whitespace.
   - Strips ```` ```json ```` / ```` ``` ```` fences if present.
   - Falls back to slicing from the first `{` to the last `}` before parsing.
   - Returns `null` on failure.
2. Replace the current try/catch around `JSON.parse(content)` with this helper. If it still fails, log and return a clean error response (not a fake "summary" containing the raw JSON).
3. Defensive shape check: ensure `summary`, `deepAnalysis`, `sources` exist; coerce missing fields to safe defaults so the UI never gets the raw blob.
4. Keep the prompt/UI unchanged.

## Out of Scope

- No changes to `AIExplanation.tsx` or any other component.
- No prompt rewording, no model swap, no schema/tool-calling migration.

## Verification

- Reload the Lombardi profile, open AI Stance Analysis, confirm the summary is a normal sentence and the Deep Analysis panel shows readable paragraphs (not JSON).
- Check edge function logs to confirm no "Failed to parse AI response" entries on subsequent calls.
