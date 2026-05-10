## Problem

The admin page has 13 tabs in a single `TabsList` row, which overflows the screen and gets clipped on the right (Bulk Validation, Donor Import, Visible States are partially/fully off-screen).

## Fix

Replace the horizontal `TabsList` with a `Select` dropdown that drives the same `activeTab` state. Tabs/TabsContent stay intact below — only the trigger UI changes.

### `src/pages/Admin.tsx`

- Replace the `<TabsList>...13 TabsTriggers...</TabsList>` block with a single shadcn `<Select value={activeTab} onValueChange={setActiveTab}>` styled to match the surrounding admin layout (max-width ~320px, left-aligned, with the icon + label preserved in each `<SelectItem>`).
- Build a small `const ADMIN_TABS = [{ value, label, icon, badgeCount? }, ...]` array right above the JSX so the dropdown options and the (optional future) re-introduction of pills stay in one place. Use it to render the `<SelectItem>`s.
- Keep all `<TabsContent value="...">` blocks unchanged.
- Keep the existing dynamic `Overrides ({overrides?.length || 0})` count by computing it into the array entry.

No behavior change beyond the trigger swap. No mobile-specific branching needed — the dropdown works at every width.

