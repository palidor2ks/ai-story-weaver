# Why the Committee Causes list is incomplete

Three independent reasons the panel is missing committees today:

## 1. IE spenders are truncated to ~25 of 1,229

`useExternalCommittees` reads `independent_expenditures` with `.limit(2000)` rows (not distinct committees). Rows cluster heavily by committee, so the first 2,000 rows only contain **25 distinct** spending committees out of **1,229** that exist. Everything past those 25 is invisible in the dropdown.

**Fix:** query distinct IE committees instead of raw IE rows. Use an RPC or a dedicated query (e.g. `select distinct spending_committee_fec_id, spending_committee_name from independent_expenditures`) and raise the row cap to cover all ~1,229.

## 2. Candidate committees with NULL designation are excluded

`.not('designation', 'in', '(P,A)')` is NULL-unsafe in PostgREST and drops the 20 rows where `designation IS NULL`.

**Fix:** change the filter to also include NULL designations (e.g. `designation.is.null,designation.not.in.(P,A)` with an `.or(...)`).

## 3. Standalone PACs we never ingested can't appear

AIPAC itself isn't in the DB — only `CITIZENS AGAINST AIPAC CORRUPTION` is, because that one filed independent expenditures. Our `candidate_committees` table only holds committees tied to a candidate (Principal / Authorized / Joint / etc.), and `independent_expenditures` only holds committees that filed IE reports. A standalone PAC with no candidate link and no IE filings is **not stored anywhere** in this project today, so the cause panel has nothing to tag.

Counts today:
- `candidate_committees`: 1,252 total (504 P, 114 A, 590 J, 20 NULL, 18 U, 6 D) — ~634 external
- `independent_expenditures`: 1,229 distinct spenders
- `external_committee_finance`: 0
- `pac_expenditures`: 46

Combined, the panel *could* show ~1,800 committees once #1 and #2 are fixed. To go beyond that (e.g. AIPAC, NRA-ILA, every FEC-registered PAC), we'd need a separate ingestion step.

## Proposed scope for this change

**In scope (fixes #1 and #2 — pure UI/query work):**
- Update `useExternalCommittees` in `src/components/admin/CommitteeTopicsPanel.tsx` to:
  - Pull *distinct* IE spenders (new RPC `list_ie_spenders()` returning `fec_committee_id, name, total_amount` OR a paginated select-distinct loop), capped at 5,000.
  - Include NULL-designation candidate committees by switching the filter to an `.or(...)` clause.
- Mirror the same pool logic in the `classify-committee-topic` edge function (it has the same `limit(500)` bug for both queries), so "Run AI on unassigned" sees every committee the UI sees.
- Add a small counter at the top of the Assignments tab: "Showing X of Y external committees" so the truncation is visible if it ever happens again.

**Out of scope (issue #3):** ingesting the full FEC PAC universe. If you want AIPAC / NRA / etc. taggable even when they have no IEs and no candidate link, that's a separate feature — a new `external_pacs` table seeded from FEC's committee master file, plus an admin "add committee by FEC ID" button. Flag it and I'll plan it separately.

## Technical summary

- File: `src/components/admin/CommitteeTopicsPanel.tsx` — rewrite `useExternalCommittees`.
- File: `supabase/functions/classify-committee-topic/index.ts` — same pool logic in the auto-pick branch (no signature change).
- Migration: add SQL function `public.list_ie_spenders()` returning `(fec_committee_id text, name text, total numeric)` selecting distinct + max(name) + sum(amount) from `independent_expenditures`, grantable to authenticated. (Avoids select-distinct pagination on the client.)
- No schema changes to `committee_causes` / `committee_topics`.
