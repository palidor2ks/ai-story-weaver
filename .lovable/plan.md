## Goal

Bring PR #102 ("Add edge function to discover and store candidate X handles") into the project, fix the issues flagged by the Codex review, and expose it from the existing `/admin/social-handles` page so admins can backfill `candidates.x_handle` automatically.

## What the PR adds

A new edge function `supabase/functions/discover-representative-x-handles/index.ts` that:

- Admin-only (validates session + `user_roles.role = 'admin'`).
- Accepts `{ candidate_id?, limit?, overwrite? }`.
- Selects candidates (optionally one, optionally only those missing `x_handle`).
- For each candidate: scrapes `x.com/search?...&f=user`, extracts handles via regex, fetches each profile page, scores by name/state/office matches, and accepts the best handle if score ≥ 3.
- Updates `candidates.x_handle` for accepted matches, returns per-row status (`updated` / `not_found` / `update_failed` / `skipped_existing`).
- Throttles 400ms between candidates.

## Issues to fix before merging

1. **Candidate ID type (Codex P2)** — `candidates.id` is `TEXT` (e.g. `S001150`, `P000197`), not UUID. The PR's `z.string().uuid()` rejects every real ID. Change to `z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)`.
2. **Background execution** — scraping N candidates with two HTTP fetches each + 400ms delay easily exceeds the edge function request timeout. Wrap the per-candidate loop in `EdgeRuntime.waitUntil(...)` when no `candidate_id` is provided (batch mode), and return `{ ok: true, scanned: rows.length, mode: 'background' }` immediately. Keep synchronous behavior for single-candidate runs.
3. **Scraping fragility & rate limits** — x.com's logged-out search returns JS-rendered HTML, so handle extraction will often be empty and 429s are likely. Mitigations:
   - Treat any non-200 as `not_found` with reason `fetch_failed_<status>`.
   - On 429, back off (e.g. 2s) and skip remaining candidates in the batch, returning what we have.
   - Add a small allow-list of reserved/system handles already present, plus skip handles whose profile HTML lacks the candidate's last name entirely.
4. **Confidence threshold** — keep score ≥ 3, but also require the candidate's last-name token to appear in the profile HTML; otherwise mark as `low_confidence_match`. This avoids assigning unrelated accounts.
5. **Logging** — log scanned/updated counts and per-candidate reasons so we can debug from edge logs.
6. **No DB migration needed** — `x_handle` already exists; the Supabase branch error in the PR is unrelated (pre-existing FK constraint conflict).

## Admin UI wiring

Update `src/pages/admin/SocialHandles.tsx` to add:

- A **"Discover handle"** icon button on each row (only enabled when `x_handle` is empty). Calls `discover-representative-x-handles` with `{ candidate_id }`, then on success refetches the row.
- A **"Discover all missing"** toolbar button next to "Sync all with handles". Calls the function with `{ limit: 100, overwrite: false }`; shows a toast that the job runs in the background and the page will refresh in a minute.
- A new `useDiscoverRepresentativeHandles` hook (mirrors the existing sync hook pattern).
- Reuse existing `useAdminRole` guard and `HANDLE_RE` validation already on the page.

No new tables, no new routes, no migration.

## Files

New:
- `supabase/functions/discover-representative-x-handles/index.ts` — adapted from PR with fixes above.

Edited:
- `src/pages/admin/SocialHandles.tsx` — add discover buttons + mutation calls.

## Out of scope

- pg_cron scheduling (can be added later once we confirm scrape reliability).
- Switching to the official X API for discovery (would need a new paid endpoint).
- Storing per-candidate discovery audit history.
