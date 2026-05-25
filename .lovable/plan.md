## Goal
Port PR #82 from `ai-story-weaver`: add a page-scoped batch action that fills AI answers only for the currently visible unanswered candidates in the coverage panel, so operators can do quick spot-fills without touching the full dataset.

## Change
Single file: `src/components/admin/AnswerCoveragePanel.tsx`.

### 1. New handler (next to `handleFillAll`, ~line 491)
```ts
const handleFillVisibleUnanswered = async () => {
  try {
    const toProcess = paginatedCandidates
      .filter(c => c.answerCount === 0)
      .slice(0, 50)
      .map(c => ({ id: c.id, name: c.name }));
    if (toProcess.length === 0) {
      toast.info('No unanswered candidates on this page');
      return;
    }
    await populateBatch(toProcess, false);
  } catch (err) {
    console.error('[Admin] Fill visible unanswered failed:', err);
    toast.error('Failed to generate AI answers for visible page');
  }
};
```

### 2. New derived count (next to `noAnswersCount`)
```ts
const visibleUnansweredCount = paginatedCandidates.filter(c => c.answerCount === 0).length;
```

### 3. New dropdown item in the AI Actions menu
Insert after the existing "Generate for Empty Profiles" `AlertDialog` (~line 708), before "Refresh Incomplete Profiles":

- Label: `Fill Unanswered on This Page ({Math.min(visibleUnansweredCount, 50)})`
- Disabled when `visibleUnansweredCount === 0`
- Wrapped in an `AlertDialog` matching the surrounding pattern, with a description noting the scope: "Generates AI answers for up to 50 unanswered candidates on the current page only."
- Action calls `handleFillVisibleUnanswered`.

## Out of scope
- No new edge functions, hooks, or schema changes — re-uses `populateBatch` and existing batch progress/pause/resume UI.
- No change to filters or pagination.
- Cap kept at 50 to stay consistent with `handleFillAll` / `handleFillLowCoverage` and the project's batch limits.
