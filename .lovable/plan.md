# Include all FEC committees, PACs & SuperPACs in the Causes panel

## Goal
Every active FEC-registered committee (PAC, SuperPAC, hybrid PAC, leadership PAC, party committee, etc.) should appear in the Committee Causes panel and be taggable — not just committees tied to one of our candidates or that filed independent expenditures.

## Why it's missing today
The pool is built from only two sources:
- `candidate_committees` — committees linked to a candidate (Principal/Authorized/Joint).
- `independent_expenditures` — committees that filed IE reports we've imported.

Standalone PACs (AIPAC, Preserve America, NRA-PVF, etc.) live in neither, so they're invisible.

## Plan

### 1. New table: `external_pacs`
A library of FEC-registered committees that aren't already in `candidate_committees`.

Columns:
- `fec_committee_id` (PK)
- `name`, `committee_type`, `committee_type_full`
- `designation`, `designation_full`
- `party`, `state`, `treasurer_name`, `street_1`, `city`, `zip`
- `filing_frequency`, `organization_type`
- `cycles` (text[]), `first_file_date`, `last_file_date`
- `is_active` (bool), `source` ('fec_api' | 'manual'), `created_at`, `updated_at`

RLS: public read; admin + service_role write. Index on `name` (trigram) and `committee_type`.

### 2. Edge function: `import-fec-committee`
Single-committee add. Input `{ committee_id }`. Calls FEC `/committees/{id}/`, upserts into `external_pacs`. Used by the admin "Add by FEC ID" button.

### 3. Edge function: `sync-fec-committees` (bulk)
One-time + on-demand backfill. Paginates FEC `/committees/` with filters:
- `committee_type=N,Q,O,V,W,Y,Z,X,U` (PAC, qualified PAC, SuperPAC, hybrid, party, leadership, etc.)
- `cycle=2024,2026` (latest two cycles, active filers only)
- `per_page=100`, follow pagination

Uses `EdgeRuntime.waitUntil()` + batch upserts of 500. Writes progress to a small `fec_committee_sync_status` row. Skips committees already in `candidate_committees` (no dupes). Expected volume: ~15-25k rows.

### 4. Wire the new pool into existing UI + AI

**`useExternalCommittees` in `CommitteeTopicsPanel.tsx`** — Add `external_pacs` as a third source (union with candidate_committees + `list_ie_spenders` RPC). Dedupe by `fec_committee_id`. Existing NULL-designation and 5,000-row logic stays. Group dropdown labels: "Candidate Committees / IE Spenders / Standalone PACs".

**`classify-committee-topic` edge function** — Mirror the same pool in the auto-pick branch. Extend `gatherInfo()` to fall back to `external_pacs` for name/designation when no candidate_committees or IE row exists. AI classification logic unchanged.

### 5. Admin UI additions (Causes Library tab)
- "Add committee by FEC ID" input + button → calls `import-fec-committee`, refetches, surfaces the new row in the assignment dropdown.
- "Sync FEC committee universe" button (admin-only, confirm dialog) → triggers `sync-fec-committees`. Shows last sync timestamp and row count.

## Technical notes
- Requires `FEC_API_KEY` secret (already used elsewhere in the project — confirm at build time, add if missing).
- Pool size after sync will be ~15-25k. UI dropdown should switch from a flat list to a searchable Combobox (`cmdk`) if not already, to stay performant.
- `committee_topics` schema doesn't change — `fec_committee_id` is a free text key, so any new committee from `external_pacs` works automatically.
- Memory `External Committee Onboarding` flow is unaffected; this is a parallel taxonomy/tagging surface, not finance ingestion.

## Out of scope
- Finance ingestion for these PACs (receipts, expenditures, donor rollups). This plan only makes them **taggable**. Pulling their financial data is a separate, much larger feature.
- Historical (pre-2024) committee backfill.

## Files touched
- Migration: `external_pacs` table + `fec_committee_sync_status` table + RLS + indexes
- New: `supabase/functions/import-fec-committee/index.ts`
- New: `supabase/functions/sync-fec-committees/index.ts`
- Edit: `supabase/functions/classify-committee-topic/index.ts` (pool + gatherInfo fallback)
- Edit: `src/components/admin/CommitteeTopicsPanel.tsx` (pool union, two new admin controls, Combobox if needed)
- New hook: `src/hooks/useImportFecCommittee.ts`
