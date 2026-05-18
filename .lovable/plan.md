# Fix poll results readability on mobile

## Problem
On mobile, the recharts `BarChart` in `PollResults` forces each option's full text into a fixed 140px Y-axis column. Long answer text wraps onto many lines that overlap the bars, making it unreadable.

## Fix
Replace the recharts chart with a simple, mobile-first list layout. Each option becomes its own row:

- Option text on top, full width, wraps naturally, no truncation.
- Below it: a horizontal progress bar (full container width) with the percentage label aligned right.
- Highlight the user's pick by changing the bar color to `bg-primary` (others `bg-primary/40`) and adding a subtle ring/border on the row.
- Keep the existing "X responses · Your pick highlighted" line and the ideological spread strip as-is.

This removes the cramped two-column layout entirely, so text never overlaps the bar.

## Scope
- Edit `src/components/poll/PollResults.tsx` only.
- Remove recharts imports from this file (BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, LabelList).
- No backend, data, or other component changes.

## Technical notes
- Row structure:
  ```text
  [ option text (wraps)            ]
  [ ▓▓▓▓▓▓░░░░░░░░░░░░  ]   50%
  ```
- Use semantic tokens (`bg-primary`, `bg-muted`, `text-foreground`, `text-muted-foreground`) — no raw colors.
- Bar height ~8px, rounded; container `bg-muted`, fill width = `pct%`.
- Keep `animate-in fade-in` wrapper and the stats card.
