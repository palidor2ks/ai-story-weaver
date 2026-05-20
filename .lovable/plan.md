Fix the phone-view overlap in the Compare panel.

## What to change

1. **Mobile layout for the panel** (`src/components/ComparePanel.tsx`)
   - On phones, replace the equal-width grid with a horizontally scrollable strip where each candidate card has a fixed minimum width (~260px) and full content stays inside its own card. Keep the current 2/3/4-column grid on tablet and desktop.
   - Cap the panel height on mobile (e.g. ~70vh) and let the inner content scroll vertically so the panel never covers the entire screen.
   - Add `min-w-0` + `truncate` to name, office, donor names, and money rows so long values stop spilling into neighboring cards.
   - Restructure the header row so the title, "· 2026 cycle" label, Clear All, and close button wrap cleanly at 430px (stack title above the actions on mobile).

2. **Page spacing while panel is open** (`src/pages/Candidates.tsx`)
   - Increase the bottom padding under the candidate grid on mobile when the Compare panel is visible so the last rows are not hidden behind the panel.

No data, query, or business-logic changes — purely presentational/responsive fixes.