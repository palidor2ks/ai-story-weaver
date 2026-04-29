## Goal

Make the **State** filter dropdown in the Admin candidates panel only list states that are currently **visible** (i.e. not in `hidden_states`). Hidden states should disappear from the dropdown options.

## Change

Single file: `src/components/admin/AnswerCoveragePanel.tsx`

1. Import the existing `useHiddenStates` hook.
2. Wrap the `states` list returned by `useUniqueStates()` with a filter that drops any code present in the hidden set before rendering the `<SelectItem>`s.
3. If the currently-selected `stateFilter` value becomes hidden, reset it back to `"all"` via a small `useEffect` so the dropdown never shows a stale selection.

```text
const { isHidden } = useHiddenStates();
const visibleStates = useMemo(
  () => (states ?? []).filter(s => !isHidden(s)),
  [states, hidden]
);

useEffect(() => {
  if (stateFilter !== 'all' && isHidden(stateFilter)) setStateFilter('all');
}, [stateFilter, hidden]);
```

Then render `visibleStates.map(...)` inside the `<SelectContent>` instead of `states?.map(...)`.

## Out of Scope

- Other admin filters/tabs (only the candidates panel state dropdown was requested).
- Filtering of the candidate rows themselves in the admin view — admins still see all data; only the dropdown options change.
- No DB or RLS changes; uses the existing `get_hidden_state_codes` RPC via `useHiddenStates`.
