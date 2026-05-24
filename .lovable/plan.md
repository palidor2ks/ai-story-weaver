## Goal
The header currently shows 9 nav items + admin/politician/help icons + user pill, all rendered inline on `md+` (≥768px). Between ~768px and ~1280px the row overflows or crowds the logo, and on the user's 1309px viewport the items barely fit. Mobile uses a hamburger only below 768px, which is too aggressive a cutoff.

## Plan

**1. Tier the breakpoints in `src/components/Header.tsx`**
- Mobile (`< 1024px`, i.e. `lg`): hamburger menu (raise current `md` breakpoint to `lg`). This covers phones and most tablets and avoids the cramped 768–1024 zone.
- Desktop compact (`lg` to `xl`, 1024–1280): show nav items as icon-only buttons with `title` tooltips. Hide the user-name pill (keep just the avatar circle).
- Desktop full (`xl+`, ≥1280): show icon + label as today, plus the full user pill with name.

**2. Condense item rendering**
- Replace per-item `<Button>` with a single map that toggles label visibility via `hidden xl:inline` on the label span. Keeps one source of truth, no duplication.
- Tighten button padding at `lg` (`lg:px-2 xl:px-3`) and gap (`gap-1 xl:gap-2`) so 9 items + 3 icon buttons fit at 1024px.

**3. User pill responsiveness**
- `lg`: render avatar circle only (no name, no background pill).
- `xl+`: full pill with name as today.
- Truncate long names with `max-w-[140px] truncate`.

**4. Logo area**
- Keep logo + Beta badge; hide Beta badge below `sm` to save space on very narrow phones.

**5. Mobile menu (already exists)**
- Update the `md:hidden` toggle button to `lg:hidden` and the mobile drawer's `md:hidden` wrapper to `lg:hidden` so it matches the new breakpoint.

## Out of scope
- No changes to nav items themselves, routes, auth gating, or admin/politician visibility logic.
- No restyling of dropdowns or the mobile drawer's contents.
- No changes to `CommitteesViewSwitcher` or other sub-nav.

## Files touched
- `src/components/Header.tsx` (only file).

## Verification
- Check at 360, 768, 1024, 1280, 1440 widths via preview viewport.
- Confirm no horizontal scroll on header at any breakpoint, all items reachable, tooltips appear at `lg` compact tier.
