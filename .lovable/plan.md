## Goal

Stop vendors like **GAMBIT STRATEGIES LLC** (Democratic media-buying firm) from showing up as donors on candidate / committee / donor list pages, and prevent it going forward.

## Root causes (confirmed from data)

1. The donor import is inserting rows with `line_number = '20A'` (operating expenditures — money paid *to* a vendor) into `donors`. Every Gambit row tied to HARRIS FOR PRESIDENT, FIGHT FOR THE PEOPLE PAC, NIKKI FOR CONGRESS came in this way.
2. There is no vendor reference list. Vendor refunds / offsets on lines 14/15/17 (e.g. Beasley $32k, Priorities USA $239k) have no way to be flagged and excluded the way `conduit_organizations` flags ActBlue.

## Changes

### 1. New table `vendor_organizations`

Mirror of `conduit_organizations`:

```text
vendor_organizations
  id uuid pk
  name text not null  (UPPER-cased canonical form)
  aliases text[] default '{}'
  category text   ('media_buyer' | 'consulting' | 'fundraising' | 'legal' | 'tech' | 'other')
  notes text
  is_active bool default true
  created_at / updated_at
```

RLS: public SELECT, admin ALL, service_role ALL. Seed with `GAMBIT STRATEGIES`, `GAMBIT STRATEGIES LLC`, `GAMBIT STRATEGIES, LLC`.

### 2. Backfill cleanup (data migration via insert tool / SQL)

- `DELETE FROM donors WHERE line_number LIKE '20%'` — these are disbursements, never donations.
- `DELETE FROM contributions WHERE line_number LIKE '20%'` (same reason).
- `DELETE FROM donors d WHERE EXISTS (vendor match on UPPER(name))` — removes the Gambit refund-style rows on lines 14/15/17 from donor views. They remain available via `contributions` for the vendor-refunds admin panel.

### 3. RPC + hook updates

- Update `get_donors_paginated`, `search_donors_by_name`, `search_raw_donors_by_name`, and the candidate-donor RPC to LEFT JOIN `vendor_organizations` on `UPPER(name) = vo.name OR UPPER(name) = ANY(vo.aliases)` and exclude active matches (unless caller passes `p_include_vendors = true`).
- Add an `is_vendor_org` flag on returned rows so admin views can still see them with a badge.

### 4. Import-time guard (edge function)

In the FEC / CSV donor import edge function:

- Skip any row where `line_number` starts with `'20'` (operating expenditure / loan repayment / refund of contribution to candidate) — log to `donor_import_sessions.undo_summary.skipped_disbursements`.
- For lines 14/15/17, look up the contributor name against `vendor_organizations`. If matched, insert into `contributions` only (for refund tracking) but **not** into `donors`.

### 5. Admin UI

- New "Vendors" panel under the existing Donor admin section (sibling of `DonorAliasesPanel`), reusing the same patterns: list, add, edit aliases, deactivate. No new design system tokens.
- Add a small "Vendor" badge on any admin donor row that matches.

## Out of scope

- AI-assisted vendor detection.
- Re-classifying historical Gambit *contributions* as offsets in `finance_reconciliation` (separate follow-up).
- Touching `external_committee_finance` or IE flows.

## Order of operations

1. Create `vendor_organizations` migration + seed.
2. Update RPCs to exclude vendors.
3. Backfill delete of line 20x rows + Gambit donor rows.
4. Edge function import guard.
5. Admin "Vendors" panel.

Each step is independently shippable; user-visible fix (Gambit disappears from candidate donor lists) lands after step 3.
