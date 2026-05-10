## Cleanup pass

I read both files end-to-end. They're mostly clean (the previous refactor already swapped fragmented data sources for `useUnifiedCandidates`), but a few leftover stubs remain in `Feed.tsx`. `Candidates.tsx` has no dead imports/hooks/variables.

### `src/pages/Feed.tsx`

1. **`const representativesError = null;` (line 28)** — leftover from when Feed called `useRepresentatives()` directly and read its `error` field. It is now hard-coded to `null`, so the dependent `<Alert>` block at lines 223‑230 is unreachable dead code.
   - Remove the variable.
   - Remove the `{representativesError && (...)}` alert block.
   - Remove the now-unused `AlertCircle` icon import (line 15) if no other usage remains (it isn't used elsewhere).

2. **`const candidatesWithScores = transformedCandidates;` (line 72)** — pointless alias left over from a prior version that derived scores separately. Replace the three downstream references (`candidatesWithScores`) with `transformedCandidates` and delete the alias.

### `src/pages/Candidates.tsx`

No leftover imports, hooks, or variables found. Every import is referenced, every `useCallback`/`useMemo` is used, and there are no aliasing wrappers around the unified hook output. No changes.

### Why this prevents conditional-hook issues

Eliminating dead variables that look like the result of an old hook (e.g. `representativesError`) removes the temptation in future edits to "wire it back up" inside a conditional branch. With nothing left to wire up, all hook calls stay at the top level unconditionally.

### Verification

- TypeScript build passes with no unused-variable warnings on these two files.
- Feed page still renders identically (the removed alert was unreachable).
- No behavior change on Candidates.
