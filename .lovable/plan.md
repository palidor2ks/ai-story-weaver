## Fix mobile layout for Top Spenders list

The committee name truncates to one or two letters on mobile because the cause badge ("PROGRESSIVE (GENERAL)", "PRO-TRUMP / MAGA", etc.) sits on the same line as the name and reserves up to 220px of width. On a 390px viewport that leaves almost no room for the name.

### Changes in `src/pages/TopSpenders.tsx` (row component, lines ~393–443)

1. **Stack the cause badge under the committee name on mobile.**
   - Wrap `<name>` + `<badge>` so the badge moves to its own line below the name on `< sm` and stays inline at `sm:` and up.
   - Result on mobile: name gets the full middle column width and no longer truncates to "F…".

2. **Tighten the badge on small screens.**
   - Drop `max-w-[220px]` to something like `max-w-[160px]` and keep `truncate` so long labels like "PROGRESSIVE (GENERAL)" shorten gracefully instead of dominating the row.

3. **Make the row breathe a bit more.**
   - Bump the name text from default to `text-sm sm:text-base` and the meta line from `text-[11px]` to `text-xs` so the FEC id / expenditure count is readable.
   - Reduce the outer column gap from `gap-3` to `gap-2` on mobile (`gap-2 sm:gap-3`) to give the name column more room.
   - Keep the total amount column right-aligned and unchanged.

4. **Allow the name to wrap to two lines on mobile instead of hard-truncating.**
   - Replace `truncate` on the name with `line-clamp-2 sm:truncate` so on phones the full name is visible across two lines, while desktop keeps the single-line truncation behavior.

No data, sorting, or business-logic changes — purely the row's CSS classes and DOM grouping.
