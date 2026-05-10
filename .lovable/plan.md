## Problem

`candidates` has duplicate rows for the same person — same name + state, but two ids: a bioguide id (e.g. `P000034`) and an FEC-style id (e.g. `H8NJ03073`). Confirmed duplicates today:

| Person | Bioguide row | FEC-id row |
|---|---|---|
| Frank Pallone (NJ) | `P000034` | `H8NJ03073` |
| Steve Daines (MT) | `D000618` | `S2MT00096` |
| Ryan Zinke (MT) | `Z000018` | `H4MT01041` |
| Ashley Hinson (IA) | `H0IA01174` | `S6IA00314` |

Two import paths create candidate rows and don't fully cross-check:

1. `import-legislators` upserts canonical rows keyed by **bioguide id** (`P000034`).
2. `fetch-upcoming-elections` inserts candidates from upcoming-election sources using whatever id the source provided — usually an **FEC candidate id** (`H8NJ03073`). It does try to collapse onto an existing canonical row by looking up `fec_candidate_id`, but only when the canonical row already has the matching FEC id stored (e.g. Pallone's bioguide row has the wrong FEC id `S6NJ00263`, so the collapse fails) — and it never falls back to a name+state+office match.

Both rows then accumulate independent answers, votes, donors, committees, etc., so they show up as two profiles on the site.

## Fix

Two parts: clean up the existing duplicates, and harden the insert path so new ones can't appear.

### 1. Audit + merge existing duplicates (DB migration)

Add a one-shot SQL helper to find duplicate pairs across `candidates` using a token-sorted name key (drops `Jr/Sr/II/III`, sorts tokens, lowercases) plus `state`, then for each pair:

- Pick the **bioguide-style id** as the canonical (5–7 chars, leading letter + digits, e.g. `P000034`) — that's what the rest of the app already keys on. Fall back to the older `last_updated` if neither id matches the bioguide pattern.
- Repoint all child rows from the duplicate id → canonical id, in a single transaction:
  - `candidate_answers`, `candidate_votes`, `candidate_committees`, `candidate_fec_ids`, `candidate_overrides`, `candidate_topic_scores`, `donors`, `committee_finance_rollups`, `finance_reconciliation`, `external_committee_finance`, `pac_candidate_totals`, `pac_expenditures`, `election_candidates`, `profile_claims`, `mayor_fetch_queue.resulting_candidate_id`.
  - For tables with a unique key on (candidate_id, …) — e.g. `candidate_answers (candidate_id, question_id)` — first delete duplicates that would collide, keeping the row on the canonical id; then update the rest.
- Copy any non-null fields from the duplicate that are null on the canonical (e.g. `fec_candidate_id`, `image_url`, `lis_member_id`).
- Delete the duplicate `candidates` row.
- Trigger `recalculate_candidate_coverage(canonical_id)` once at the end.

Then verify with the same audit query and report 0 duplicate groups.

The four pairs above are the full current set — confirmed by querying every candidate with the token-sort key. The migration applies the merge to each.

### 2. Prevent new duplicates (insert hardening)

**a. Add a Postgres safety net.** A `BEFORE INSERT` trigger on `candidates` that, for each new row:

1. Builds the same normalized name key (lowercase, strip punctuation, drop suffixes, sort tokens).
2. Looks for an existing candidate with the same name key + state (and, if both have a district, same district).
3. If a match is found, raise a clear `EXCEPTION` (`duplicate_candidate: <existing_id>`) — never silently insert a second profile. Edge functions / admin tools then have to either reuse the existing id or explicitly merge.

This is the real guarantee — every write path goes through Postgres, so no future code change can bypass it.

**b. Tighten `fetch-upcoming-elections.persistCandidates`** so the trigger never has to fire in the common case:

- Before insert, look up by **(normalized name, state, office-class)** in addition to the existing FEC-id lookup. If found, repoint `c.id` to that canonical id and skip the insert.
- Office-class = "house" / "senate" / "exec" / "other" derived from `office` so a Senate row never collapses onto a House row.
- Keep the existing FEC-id path; just stop relying on it as the only check.

**c. Backfill `candidates.fec_candidate_id`** for any canonical rows that are missing it (or have the wrong one, like Pallone's `S6NJ00263`) by joining on `candidate_fec_ids` where `is_primary = true`. This makes the existing FEC-id collapse path work for future cycles too.

No UI changes — this is all DB + edge function. After the migration, the duplicate Pallone (and the other three) will disappear from every page that lists candidates, and the trigger blocks regressions.

## Technical notes

- All SQL goes through `supabase--migration` so the user approves it.
- The merge uses `INSERT … ON CONFLICT DO NOTHING` + `DELETE` of the loser rows in the unique-keyed child tables to keep canonical answers/votes/etc. without losing data the canonical didn't already have.
- The `BEFORE INSERT` trigger uses `SECURITY DEFINER` and is exempted only when `auth.role() = 'service_role'` AND a `current_setting('app.allow_duplicate_candidate', true) = 'on'` is set — so admin merges can override it deliberately, but normal imports cannot.
- After deploy, re-run the audit query in the migration's `RAISE NOTICE` to confirm 0 duplicate groups.
