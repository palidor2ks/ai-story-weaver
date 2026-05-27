## Goal

Replace the unreliable x.com search-scrape with the official House Press Gallery roster as the primary source of House members' X handles. Keep the existing scrape path as a fallback for Senate and non-House candidates where this list doesn't apply.

## Why this source is better

`https://pressgallery.house.gov/member-data/members-official-x-handles-119th-congress` is:
- Official and maintained by the House Press Gallery (last updated 04/29/2026).
- Structured as a clean HTML table: `FirstName | LastName | X Handle | St/Dis | Party`.
- Covers every sitting House member with a verified handle (e.g. `@RepAdams`, `@RepPeteAguilar`).
- No JS rendering, no rate limits, no 429s — one HTTP fetch returns everything.

Match key in our DB: `candidates.state` + district (parsed from `St/Dis` like `NC12` → state=NC, district=12) + last name. Office must be a House role.

## What changes

### 1. New edge function: `sync-house-press-gallery-handles`

New file `supabase/functions/sync-house-press-gallery-handles/index.ts`. Admin-only (same auth pattern as the existing discover function).

Flow:
1. Fetch the press gallery URL once.
2. Parse the HTML table rows into `{ firstName, lastName, handle, state, district, party }`. Strip leading `@` and validate against `^[A-Za-z0-9_]{1,15}$`.
3. Query `candidates` where office matches House (`U.S. House`, `Representative`, etc. — reuse existing office matching used elsewhere in the project).
4. For each parsed row, find the candidate by `state` + `district` + last-name match (case-insensitive). District `00` → at-large, stored however the project currently stores it.
5. Update `candidates.x_handle` when:
   - Candidate has no handle, OR
   - `overwrite: true` was passed and the existing handle differs.
6. Return `{ scanned, matched, updated, skipped, unmatched: [...] }` so admins can see which press-gallery rows didn't map to a known candidate.

Input schema: `{ overwrite?: boolean, dry_run?: boolean }`. No `candidate_id` — this is a bulk roster sync. Runs synchronously (single fetch + bulk DB update is fast).

### 2. Update the existing discover function

`supabase/functions/discover-representative-x-handles/index.ts` stays for Senate + non-Congress candidates. Add a small guard: if the candidate's office is a House seat, return `status: 'skipped_use_press_gallery'` instead of scraping x.com, so the two paths don't fight each other.

### 3. Admin UI wiring

In `src/pages/admin/SocialHandles.tsx`:
- New toolbar button **"Sync from House Press Gallery"** that calls `sync-house-press-gallery-handles` with `{ overwrite: false }`. Show a result toast: "Updated N House members; M unmatched rows".
- A secondary **"Preview (dry run)"** option (e.g. dropdown menu next to the button) that calls with `{ dry_run: true }` and shows the unmatched list in a dialog so an admin can spot naming mismatches.
- Keep the existing per-row "Discover" and batch "Discover all missing" buttons as the fallback for Senate / state-level candidates.

### 4. Out of scope (for now)

- Senate equivalent: there is no single comparable Senate Press Gallery handle list; senators stay on the scrape path. We can revisit if a clean source is found.
- Scheduling: no pg_cron yet. Admin runs the sync manually when the press gallery updates.
- Storing source/provenance (`x_handle_source = 'press_gallery'`): can be added later if useful for audit.

## Files

New:
- `supabase/functions/sync-house-press-gallery-handles/index.ts`

Edited:
- `supabase/functions/discover-representative-x-handles/index.ts` — skip House candidates.
- `src/pages/admin/SocialHandles.tsx` — add toolbar button + dry-run preview dialog.

## Risks

- HTML structure could change. Mitigation: defensive parser that logs and aborts cleanly if the expected columns aren't found, rather than silently writing bad data.
- Name mismatches (nicknames, accented characters like "Barragán"). Mitigation: normalize accents and compare against both `name` and any alternate-name fields; surface unmatched rows in the response so an admin can fix the candidate record.
