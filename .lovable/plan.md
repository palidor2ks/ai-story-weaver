## Goal
Move the new batch action into the Search / High-Volume Mode toolbar row (the highlighted area in the screenshot), and change its scope from "current page" to "all candidates currently visible in the chart" — i.e. everything matching the active filters, not just the paginated slice.

## Change
Single file: `src/components/admin/AnswerCoveragePanel.tsx`.

### 1. Rescope handler + count
Replace `paginatedCandidates` with `filteredCandidates` so it covers every rep visible under the current filter set:

```ts
const visibleUnansweredCount = filteredCandidates.filter(c => c.answerCount === 0).length;

const handleFillVisibleUnanswered = async () => {
  try {
    const toProcess = filteredCandidates
      .filter(c => c.answerCount === 0)
      .slice(0, 50)
      .map(c => ({ id: c.id, name: c.name }));
    if (toProcess.length === 0) {
      toast.info('No unanswered candidates in current view');
      return;
    }
    await populateBatch(toProcess, false);
  } catch (err) {
    console.error('[Admin] Fill visible unanswered failed:', err);
    toast.error('Failed to generate AI answers for visible candidates');
  }
};
```

Cap stays at 50 to match the other batch actions and existing edge-function limits.

### 2. Remove the dropdown item
Delete the "Fill Unanswered on This Page" `AlertDialog` block we added inside the AI Actions dropdown (between "Generate for Empty Profiles" and "Refresh Incomplete Profiles", ~lines 711–731).

### 3. Add button to the Search / High-Volume toolbar row
In the `flex flex-wrap gap-3 items-center` row at ~line 1785, after the High-Volume Mode toggle block, add an `AlertDialog`-wrapped button:

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button
      variant="outline"
      size="sm"
      disabled={anyBatchRunning || visibleUnansweredCount === 0}
    >
      <Sparkles className="h-4 w-4 mr-1.5" />
      Fill Unanswered in View ({Math.min(visibleUnansweredCount, 50)})
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Fill Unanswered in Current View?</AlertDialogTitle>
      <AlertDialogDescription>
        Generates AI answers for up to 50 unanswered candidates matching your current filters.
        Useful for spot-fills scoped to whatever's in the chart right now.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleFillVisibleUnanswered}>Generate</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Re-uses existing `Sparkles`, `Button`, and `AlertDialog` imports already in the file.

## Out of scope
- No backend / hook / schema changes — still re-uses `populateBatch`.
- No filter or pagination changes.
- No change to the other AI Actions dropdown items.
